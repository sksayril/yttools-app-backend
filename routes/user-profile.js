const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');

// Middleware to authenticate user
const authenticateUser = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    
    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ message: 'Authentication failed' });
  }
};

// Get user profile
router.get('/profile', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-Password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    return res.status(200).json({
      message: 'User profile retrieved',
      user
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Update user profile
router.put('/profile', authenticateUser, async (req, res) => {
  try {
    const { FirstName, LastName, upiId } = req.body;
    
    const updates = {};
    if (FirstName) updates.FirstName = FirstName;
    if (LastName) updates.LastName = LastName;
    if (upiId !== undefined) updates.upiId = upiId;
    
    const user = await User.findByIdAndUpdate(
      req.userId,
      updates,
      { new: true }
    ).select('-Password');
    
    return res.status(200).json({
      message: 'Profile updated successfully',
      user
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Update user type to creator
router.put('/become-creator', authenticateUser, async (req, res) => {
  try {
    // Check if user is already a creator
    if (req.user.userType === 'creator') {
      return res.status(400).json({ message: 'You are already a creator' });
    }
    
    // Update user type to creator
    const user = await User.findByIdAndUpdate(
      req.userId,
      { userType: 'creator' },
      { new: true }
    ).select('-Password');
    
    return res.status(200).json({
      message: 'You are now a creator!',
      user
    });
  } catch (error) {
    console.error('Error becoming creator:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Get user wallet details
router.get('/wallet', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('coins walletBalance');
    
    // Get recent transactions
    const transactions = await Transaction.find({ 
      userId: req.userId 
    })
    .sort({ createdAt: -1 })
    .limit(10);
    
    return res.status(200).json({
      message: 'Wallet details retrieved',
      wallet: {
        coins: user.coins,
        walletBalance: user.walletBalance
      },
      recentTransactions: transactions
    });
  } catch (error) {
    console.error('Error fetching wallet details:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Get subscription details
router.get('/subscription', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('subscriptionStatus subscriptionExpiry subscriptionId');
    
    const isActive = user.subscriptionStatus && new Date(user.subscriptionExpiry) > new Date();
    
    return res.status(200).json({
      message: 'Subscription details retrieved',
      subscription: {
        active: isActive,
        expiryDate: user.subscriptionExpiry,
        subscriptionId: user.subscriptionId
      }
    });
  } catch (error) {
    console.error('Error fetching subscription details:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

module.exports = router;
