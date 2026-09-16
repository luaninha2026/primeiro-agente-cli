require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// Importações - MANTENHA O CAMINHO CORRETO!
const authRoutes = require('./authRoutes'); 
const chatRoutes = require('./chatRoutes'); 
const authMiddleware = require('./authMiddleware');

const app = express();
app.use(cors());
app.use(express.json());

// Conexão com Banco
mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log('📦 Banco Conectado'))
    .catch(err => console.error('❌ Erro Banco:', err));

// Rota de Health (O 404 morre aqui)
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: "ok", message: "Servidor online" });
});

// Rotas
app.use('/api/auth', authRoutes);
app.use('/api/chat', authMiddleware, chatRoutes);

// Tratamento de erro detalhado para ver no log do Render
app.use((err, req, res, next) => {
    console.error("🚨 ERRO NO SERVIDOR:", err);
    res.status(500).json({ erro: "Erro interno", detalhe: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor na porta ${PORT}`));