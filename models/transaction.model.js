const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  videoId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Video'
  },
  type: { 
    type: String, 
    enum: ['earn', 'spend', 'subscription', 'recharge'],
    required: true 
  },
  amount: { 
    type: Number, 
    required: true 
  },
  coins: {
    type: Number,
    required: true
  },
  razorpayPaymentId: {
    type: String
  },
  razorpayOrderId: {
    type: String
  },
  razorpaySignature: {
    type: String
  },
  status: { 
    type: String, 
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model("Transaction", transactionSchema);
