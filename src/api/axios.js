import axios from 'axios';

// This tells React to always talk to your Node.js server
const API = axios.create({
    baseURL: 'https://pict-canteen-api.onrender.com/api', // 🚀 THE FIX: Updated to the deployed backend URL
});
export default API;