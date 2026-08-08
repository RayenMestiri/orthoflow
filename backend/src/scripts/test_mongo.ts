import mongoose from 'mongoose';
import { env } from '../config/env.js';

console.log('Testing connection to MongoDB Atlas...');
try {
  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  });
  console.log('SUCCESS: Connected to MongoDB Atlas!');
  await mongoose.disconnect();
} catch (err) {
  console.error('ERROR connecting to MongoDB Atlas:', err);
}
