const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

// Rota para conversar
router.post('/', chatController.enviarMensagem);

// Rota para limpar histórico
router.delete('/limpar', chatController.limparHistorico);

module.exports = router;