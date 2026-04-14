// 1. Importações (Bibliotecas)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const mongoose = require('mongoose');

// Conectando ao Banco de Dados Nuvem
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log('📦 Conectado ao MongoDB Atlas!'))
  .catch((err) => console.error('❌ Erro no banco:', err));

// Definindo como a mensagem será salva no banco
const MensagemSchema = new mongoose.Schema({
    role: String, // 'user' (usuário) ou 'model' (IA)
    parts: [{ text: String }], // O conteúdo da mensagem
    dataHora: { type: Date, default: Date.now } // Hora exata
});

// Criando a "Tabela" (Collection) baseada no Schema
const Mensagem = mongoose.model('Mensagem', MensagemSchema);


// 2. Configurações Iniciais do Servidor
const app = express();
app.use(express.json()); // Permite que o servidor entenda JSON
app.use(cors()); // Permite que front-ends se conectem sem bloqueio

// 3. Configuração da IA
const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

// 4. CRIANDO A ROTA (Endpoint) DA API
app.post('/api/chat', async (req, res) => {
    try {
        const { pergunta } = req.body;
        if (!pergunta) return res.status(400).json({ erro: "Envie uma pergunta." });

        // 1. Salva a pergunta do usuário no Banco
        await Mensagem.create({ role: "user", parts: [{ text: pergunta }] });

        // 2. Busca o histórico e USA O .lean() para vir como objeto puro, sem "lixo" do banco
        const mensagensBanco = await Mensagem.find()
                                        .sort({ dataHora: 1 })
                                        .limit(20)
                                        .lean(); 

        // 3. LIMPEZA TOTAL: Monta o histórico EXATAMENTE como o Gemini quer
        const historicoLimpo = mensagensBanco.map(m => ({
            role: m.role === "user" ? "user" : "model",
            parts: [{ text: m.parts[0].text }] // Pega apenas o texto, ignora IDs
        }));

        // 4. Configura o modelo e inicia o chat
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        // Remove a última mensagem do histórico para não enviar duplicado (já que vamos dar sendMessage nela)
        const historyParaIA = historicoLimpo.slice(0, -1);

        const chat = model.startChat({
            history: historyParaIA
        });

        // 5. Envia a pergunta atual
        const result = await chat.sendMessage(pergunta);
        const respostaDaIA = result.response.text();

        // 6. Salva a resposta da IA no Banco
        await Mensagem.create({ role: "model", parts: [{ text: respostaDaIA }] });

        return res.status(200).json({ sucesso: true, resposta: respostaDaIA });

    } catch (erro) {
        console.error("❌ Erro detalhado:", erro);
        return res.status(500).json({ erro: "Erro ao processar mensagem." });
    }
});


// 5. Ligar o Servidor na porta 3000
const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => {
    console.log(`🚀 Servidor rodando na porta ${PORTA}`);
});
