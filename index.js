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

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

//mongoDB연결
const mongoUri = 'mongodb://127.0.0.1:27017/chat'; // 로컬 MongoDB URI
mongoose.connect(mongoUri)
    .then(() => console.log('MongoDB connected'))
    .catch((err) => console.log('MongoDB connection error:', err));

// 스키마 정의
const chatSchema = new mongoose.Schema({
    server_id: { type: String, required: true },
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

    socket.on('join_room', (data) => {
        socket.join(data.room);
        io.to(data.room).emit('enter', data.nick);
        console.log(data.nick + '님이 '+ data.room +'방에 들어오셨습니다.');
    });

    socket.on('disconnect', (data) => {
        //한명이 나감
        console.log(data);
    });

    socket.on('send_msg', function(data) {
        console.log(data);
        io.to(data.room).emit('message', data);
    });

    //몇 명이 접속해 있는지 확인
    socket.on('get_pers', (room, callback) => {
        const roomInfo = io.sockets.adapter.rooms[room];
        const userCount = roomInfo ? roomInfo.length : 0;
        callback(userCount);
    });

});












