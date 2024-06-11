const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

const app = express();

app.use(cors());
app.use(bodyParser.json());

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

// 서버 목록과 각 서버의 접속 인원을 저장할 객체
const servers = {};

//mongoDB연결
const mongoUri = 'mongodb://127.0.0.1:27017/chat'; // 로컬 MongoDB URI
mongoose.connect(mongoUri)
    .then(() => console.log('MongoDB connected'))
    .catch((err) => console.log('MongoDB connection error:', err));

// 스키마 정의
const chatSchema = new mongoose.Schema({
    server_name: { type: String, required: true },
    chat_nickname: { type: String, required: true },
    chat_contents: { type: String, required: true },
    chat_date: { type: Date, default: Date.now },
    file_name: String,
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

//정적 파일 읽어오기
//app.use(express.static(path.join(__dirname, 'public')));

const port = process.env.port || 3000;

server.listen(port, () => {
    console.log('server is running on port '+port);
});

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
        console.log(data);

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
        } catch(err) {
            console.log(err);
        }

        io.to(data.room).emit('message', data);
    });

});












