const mongoose = require("mongoose");

const paymentRequestSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  upiId: { 
    type: String, 
    required: true 
  },
  coins: { 
    type: Number, 
    required: true 
  },
  amount: { 
    type: Number, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  note: {
    type: String
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  processedAt: { 
    type: Date
  }
});

module.exports = mongoose.model("PaymentRequest", paymentRequestSchema);
