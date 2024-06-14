const express = require('express');
const mongoose = require('mongoose');
const PropertiestReader = require('properties-reader');

//properties file 읽어오기
const properties = PropertiestReader('common.properties');

const app = express();

//mongoDB연결
//const mongoUri = 'mongodb://127.0.0.1:27017/chat'; // 로컬 MongoDB URI
const mongoUri = properties.get('mongo.uri');
mongoose.connect(mongoUri)
    .then(() => console.log('MongoDB connected'))
    .catch((err) => console.log('MongoDB connection error:', err));

const serverSchema = new mongoose.Schema({
    server_name: { type: String, required: true },
    server_pers: { type: Number, required: true }
});

const Server = mongoose.model('Server', serverSchema);

const guNames = [
    "종로구", "중구", "용산구", "성동구", "광진구", "동대문구",
    "중랑구", "성북구", "강북구", "도봉구", "노원구", "은평구",
    "서대문구", "마포구", "양천구", "강서구", "구로구", "금천구",
    "영등포구", "동작구", "관악구", "서초구", "강남구", "송파구",
    "강동구"
];

const pers = 0;

// 각 구 이름을 데이터베이스에 삽입
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

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});







