const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const AWS = require('aws-sdk');
const PropertiestReader = require('properties-reader');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const multer = require('multer');

const app = express();

//properties file 읽어오기
const properties = PropertiestReader('common.properties');

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());

const upload = multer({ 
    dest: 'tmp/',
    limits: { fileSize: 200 * 1024 * 1024 }
});

app.get('/listServer', async (req, res) => {

    try {
        // 서버 모델에서 모든 서버 목록을 조회
        const servers = await Server.find().sort({ server_name: 1 });
        // 조회한 서버 목록을 클라이언트에게 반환
        res.json(servers);
    } catch (err) {
        console.error('서버 목록 조회 중 오류 발생:', err);
        res.status(500).send('서버 목록을 가져오는 동안 오류가 발생했습니다.');
    }

});

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

//mongoDB연결
//const mongoUri = 'mongodb://localhost:27017/chat'; // 로컬 MongoDB URI 이제 필요 ㄴ
const mongoUri = properties.get('mongo.uri');
mongoose.connect(mongoUri)
    .then(() => console.log('MongoDB connected'))
    .catch((err) => console.log('MongoDB connection error:', err));

// 스키마 정의
const chatSchema = new mongoose.Schema({
    server_name: { type: String, required: true },
    chat_nickname: { type: String, required: true },
    chat_contents: String,
    chat_date: { type: Date, default: Date.now },
    file_name: String,
    file_type: String,
    file_uuid: String,
    file_url: String,
    file_short_url: String
});

const serverSchema = new mongoose.Schema({
    server_name: { type: String, required: true },
    server_pers: { type: Number, required: true }
});

const Chat = mongoose.model('Chat', chatSchema);
const Server = mongoose.model('Server', serverSchema);

// 서울특별시의 구 이름 목록
const guNames = [
    "종로구", "중구", "용산구", "성동구", "광진구", "동대문구",
    "중랑구", "성북구", "강북구", "도봉구", "노원구", "은평구",
    "서대문구", "마포구", "양천구", "강서구", "구로구", "금천구",
    "영등포구", "동작구", "관악구", "서초구", "강남구", "송파구",
    "강동구"
];

app.get('/', (req, res) => {
    res.send('Hello World!');
});

const checkAndMakeServer = async () => {

    const allServers = await Server.find();

    if(allServers.length == 0) {

        const pers = 0;
        guNames.forEach(async guName => {
            try {
                const server = new Server({
                    server_name: guName,
                    server_pers: pers
                });
                await server.save();
                console.log(`Inserted ${guName} with ${pers} persons`);
            } catch (err) {
                console.error(`Failed to insert ${guName}:`, err);
            }
        });

    }
}

checkAndMakeServer();

//정적 파일 읽어오기
//app.use(express.static(path.join(__dirname, 'public')));

const port = process.env.port || 3000;

server.listen(port, () => {
    console.log('server is running on port '+port);
});

const endpoint = properties.get('storage.endPoint');
const region = 'kr-standard';
const access_key = properties.get('storage.accessKey');
const secret_key = properties.get('storage.secretKey');

const S3 = new AWS.S3({
    endpoint,
    region,
    credentials: {
        accessKeyId : access_key,
        secretAccessKey: secret_key
    }
});

const bucket_name = properties.get('storage.bucketName');

const folder_name = 'chat';

io.on('connection', (socket) => {

    socket.on('join_room', async (data) => {

        socket.join(data.room);

        try {
            // 해당 방의 서버 정보를 찾아서 인원수를 1 증가시킴
            await Server.updateOne({ server_name: data.room }, { $inc: { server_pers: 1 } });
        } catch (err) {
            console.error('DB에 인원 수 업데이트 중 오류 발생:', err);
        }

        io.to(data.room).emit('enter', data.nick);
        console.log(data.nick + '님이 '+ data.room +'방에 들어오셨습니다.');

        try {

             // 오늘 날짜를 구합니다.
            const today = new Date();
            today.setHours(0, 0, 0, 0); // 시간 부분을 00:00:00으로 설정

            // 이전 채팅 이력을 조회
            const previousChats = await Chat.find({ 
                server_name: data.room,
                chat_date: { $gte:today } 
            }).sort({ chat_date: 1 }); // 최신순으로 정렬하려면 { chat_date: -1 }

            // 조회한 채팅 이력을 클라이언트에게 전송
            socket.emit('chatList', previousChats);

        } catch(err) {
            console.error('이전 채팅 이력 조회 중 오류 발생:', err);
        }

    });

    socket.on('disconnect', async (data) => {
        //한명이 나감
        console.log('data : ' + data);

         // 클라이언트가 방을 나갈 때 전체 서버의 인원수를 업데이트함
         try {
            // 모든 서버의 인원수를 가져옴
            const allServers = await Server.find();
            for (const server of allServers) {
                // 해당 서버의 방에 속한 클라이언트 수를 계산
                const roomClients = io.sockets.adapter.rooms.get(server.server_name);
                const numClientsInRoom = roomClients ? roomClients.size : 0;
                // 해당 서버의 인원수를 업데이트함
                server.server_pers = numClientsInRoom;
                await server.save();
            }
        } catch (err) {
            console.error('DB에 인원 수 업데이트 중 오류 발생:', err);
        }

    });

    socket.on('send_msg', function(data) {
        console.log(data);
        
        //db에 chat저장
        try {
                 // 현재 날짜 객체 생성
                const currentDate = new Date();

                // 원하는 형식으로 날짜 문자열 생성
                //const formattedDate = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getDate().toString().padStart(2, '0')} 00:00:00`;
                //const formattedDate = currentDate.toISOString();
                const formattedDate = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getDate().toString().padStart(2, '0')} ${currentDate.getHours().toString().padStart(2, '0')}:${currentDate.getMinutes().toString().padStart(2, '0')}:${currentDate.getSeconds().toString().padStart(2, '0')}`;

                data.date = formattedDate;

                const chat = new Chat({
                server_name : data.room,
                chat_nickname : data.nick,
                chat_contents : data.msg,
                chat_data : formattedDate
                });
                chat.save();

                console.log('mongo done');

        } catch(err) {
            console.log(err);
        }

        io.to(data.room).emit('message', data);

        console.log('send_msg done');
    });

    socket.on('upload', async (data) => {

        const { fileName, fileData, room, nick, msg } = data;

        var uuid = uuidv4();

        const localFilePath = `tmp/`+uuid;

        var key_name = folder_name + '/' + uuid;

        await S3.putObject({
            Bucket: bucket_name,
            Key: folder_name
        }).promise();

        fs.writeFile(localFilePath, fileData, (err) => {
            if (err) {
                console.error('Error saving file to local file system:', err);
                // 파일 저장 실패 시 처리
                return;
            }

            S3.upload({
                Bucket: bucket_name,
                Key: key_name,
                ACL: 'public-read',
                Body: fs.createReadStream(localFilePath)
            }, async (err, s3Data) => {
                // 로컬 파일 삭제
                fs.unlink(localFilePath, (unlinkErr) => {
                    if (unlinkErr) {
                        console.error('Error deleting local file:', unlinkErr);
                    }
                });
    
                if (err) {
                    console.error('File upload failed:', err);
                    // 업로드 실패 시 처리
                } else {
                    console.log('File uploaded:', s3Data.Location);
                    data.file_url = s3Data.Location;

                    var client_id = properties.get('short.clientId');
                    var client_secret = properties.get('short.clientSecret');
                    var query = encodeURI(data.file_url);

                    var api_url = 'https://naveropenapi.apigw.ntruss.com/util/v1/shorturl';
                    
                    const axios = require('axios');

                    try {

                        const res = await axios.get(api_url, {
                            headers: {
                                'X-NCP-APIGW-API-KEY-ID': client_id, 
                                'X-NCP-APIGW-API-KEY': client_secret
                            },
                            params: {
                                url: query
                            }
                        });

                        if (res.status === 200) {
                            console.log(res.data);
                            data.shortUrl = res.data.result.url;
                        } else {
                            console.log('Error creating short URL:', err.response ? err.response.data : err.message);
                        }

                    }catch(err) {
                        console.log(err);
                    }

                    data.fileUUid = uuid;
                    data.fileType = 'img';

                    console.log(data);

                     //db에 chat저장
                    try {
                            // 현재 날짜 객체 생성
                            const currentDate = new Date();

                            // 원하는 형식으로 날짜 문자열 생성
                            //const formattedDate = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getDate().toString().padStart(2, '0')} 00:00:00`;
                            //const formattedDate = currentDate.toISOString();
                            const formattedDate = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getDate().toString().padStart(2, '0')} ${currentDate.getHours().toString().padStart(2, '0')}:${currentDate.getMinutes().toString().padStart(2, '0')}:${currentDate.getSeconds().toString().padStart(2, '0')}`;

                            data.date = formattedDate;

                            if(data.chat_contents == null || data.chat_contents == undefined) {
                                data.chat_contents = '';
                            }

                            const chat = new Chat({
                                    server_name : data.room,
                                    chat_nickname : data.nick,
                                    chat_contents : data.msg,
                                    chat_data : formattedDate,
                                    file_name : data.fileName,
                                    file_uuid : data.fileUUid,
                                    file_url : data.file_url,
                                    file_short_url : data.shortUrl,
                                    file_type : data.fileType
                            });
                            chat.save();
                    } catch(err) {
                        console.log(err);
                    }

                    io.to(data.room).emit('message', data);

                }

            });

        });

    });

});

app.post('/upload', upload.single('video'), async (req, res) => {

    console.log('upload_video');

    const file = req.file;
    const { room, nick, msg } = req.body;
    const uuid = uuidv4();
    const localFilePath = file.path;
    const key_name = 'input' + '/' + uuid;

    console.log('start uploading to s3');

    try {

        await S3.upload({
            Bucket: 'wewu-chat-test',
            Key: key_name,
            ACL: 'public-read',
            Body: fs.createReadStream(localFilePath),
            ContentType: file.mimetype
        }).promise();

        console.log('s3 complete');

        fs.unlink(localFilePath, (err) => {
            if (err) {
                console.error('Error deleting local file:', err);
            }
        });

        //https://kr.object.ncloudstorage.com/wewu-project-test/active/0f0071e6-6109-44c6-af45-32b640d4e5b7
        const fileUrl = `${endpoint}/wewu-chat-test/${key_name}`;

        const client_id = properties.get('short.clientId');
        const client_secret = properties.get('short.clientSecret');
        const query = encodeURI(fileUrl);

        const api_url = 'https://naveropenapi.apigw.ntruss.com/util/v1/shorturl';
        const axios = require('axios');

        let shortUrl = fileUrl;
        try {
            const response = await axios.get(api_url, {
                headers: {
                    'X-NCP-APIGW-API-KEY-ID': client_id,
                    'X-NCP-APIGW-API-KEY': client_secret
                },
                params: {
                    url: query
                }
            });

            if (response.status === 200) {
                shortUrl = response.data.result.url;
            }
        } catch (err) {
            console.error('Error creating short URL:', err);
        }

        const chat = new Chat({
            server_name: room,
            chat_nickname: nick,
            chat_contents: msg || '',
            file_name: file.originalname,
            file_uuid: uuid,
            file_url: fileUrl,
            file_short_url: shortUrl,
            file_type: 'video'
        });
        await chat.save();

        io.to(room).emit('message', {
            nick : nick,
            msg : '',
            fileName: file.originalname,
            file_url: fileUrl,
            file_short_url: shortUrl,
            fileType: 'video',
            date: new Date().toISOString()
        });

        console.log('end');

        res.status(200).send('File uploaded and message sent');

    } catch (err) {
        console.error('File upload failed:', err);
        res.status(500).send('File upload failed');
    }
});












