const mongoose = require("mongoose");

const videoSchema = new mongoose.Schema({
  creatorId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  youtubeUrl: { 
    type: String, 
    required: true 
  },
  title: { 
    type: String, 
    required: true 
  },
  budget: { 
    type: Number, 
    required: true 
  },
  coinsPerView: { 
    type: Number, 
    required: true,
    min: 1,
    max: 3
  },
  totalViews: { 
    type: Number, 
    default: 0 
  },
  totalCoinsSpent: { 
    type: Number, 
    default: 0 
  },
  active: { 
    type: Boolean, 
    default: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model("Video", videoSchema);
