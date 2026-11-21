import express from 'express';
import app from './app.js';

app.use(express.static('public')); // the website
app.listen(3001, () => console.log('Fekra running on http://localhost:3001'));
