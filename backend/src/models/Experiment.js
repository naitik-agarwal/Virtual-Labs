const mongoose = require('mongoose');

const experimentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  bodies: {
    type: Array,
    required: true,
    default: []
  },
  constraints: {
    type: Array,
    required: true,
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Experiment', experimentSchema);