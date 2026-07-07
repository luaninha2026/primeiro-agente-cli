require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(cors());

// 1. Conexão com Banco de Dados com verificação
if (!process.env.MONGO_URL) {
    console.error("❌ ERRO: Variável MONGO_URL não encontrada no .env");
}

mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log('📦 Banco Conectado com Sucesso'))
    .catch(err => console.error('❌ Erro ao conectar no Banco:', err));

// 2. Schemas
const Mensagem = mongoose.model('Mensagem', new mongoose.Schema({
    role: String,
    parts: [{ text: String }],
    nickname: String,
    dataHora: { type: Date, default: Date.now }
}));

const Jogador = mongoose.model('Jogador', new mongoose.Schema({
    nome: { type: String, unique: true, required: true },
    xp: { type: Number, default: 0 }
}));

// 3. Ferramentas (Functions)
async function buscarClimaTempoReal(cidade) {
    try {
        const apiKey = process.env.WEATHER_API_KEY;
        const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(cidade)}&units=metric&lang=pt_br&appid=${apiKey}`);
        const data = await response.json();
        if (data.cod !== 200) return { erro: "Cidade não encontrada" };
        return { temperatura: `${Math.round(data.main.temp)}°C`, condicao: data.weather[0].description, cidade: data.name };
    } catch (e) { return { erro: "Erro na API de clima" }; }
}

async function adicionarXP(nickname, quantidade) {
    console.log(`✨ Adicionando ${quantidade} XP para ${nickname}`);
    try {
        const jogador = await Jogador.findOneAndUpdate(
            { nome: nickname },
            { $inc: { xp: quantidade } },
            { upsert: true, new: true }
        );
        return { xp_atual: jogador.xp, mensagem: "XP Atualizado" };
    } catch (e) { return { erro: "Erro no banco" }; }
}

const ferramentas = {
    functionDeclarations: [
        {
            name: "buscarClimaTempoReal",
            description: "Obtém o clima de uma cidade.",
            parameters: { type: "OBJECT", properties: { cidade: { type: "STRING" } }, required: ["cidade"] }
        },
        {
            name: "adicionarXP",
            description: "Dá ou tira XP do jogador.",
            parameters: { type: "OBJECT", properties: { nickname: { type: "STRING" }, quantidade: { type: "NUMBER" } }, required: ["nickname", "quantidade"] }
        }
    ]
};

// 4. Rotas
app.get('/api/ranking', async (req, res) => {
    try {
        const top10 = await Jogador.find().sort({ xp: -1 }).limit(10);
        res.json(top10);
    } catch (error) { res.status(500).json({ erro: error.message }); }
});

app.post('/api/chat', async (req, res) => {
    try {
        const { pergunta, nickname } = req.body;
        if (!pergunta || !nickname) return res.status(400).json({ erro: "Faltam dados" });

        // --- BLINDAGEM DO HISTÓRICO ---
        const msgs = await Mensagem.find({ nickname }).sort({ dataHora: 1 }).limit(10).lean();
        
        let historyParaIA = [];
        msgs.forEach(m => {
            const role = m.role === "user" ? "user" : "model";
            // Só adiciona se for diferente do último (evita erro 500 do Gemini)
            if (historyParaIA.length === 0 || historyParaIA[historyParaIA.length - 1].role !== role) {
                historyParaIA.push({
                    role: role,
                    parts: [{ text: m.parts[0].text }]
                });
            }
        });

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            tools: [ferramentas],
            systemInstruction: "Você é o Guardião do Cofre. Faça charadas de tecnologia. Se o usuário acertar, use adicionarXP(50). Se desistir, adicionarXP(-10)."
        });

        const chat = model.startChat({ history: historyParaIA });
        let result = await chat.sendMessage(pergunta);
        let response = result.response;

        // Chamada de Função
        const chamadas = response.functionCalls();
        if (chamadas && chamadas.length > 0) {
            const outputs = [];
            for (const call of chamadas) {
                if (call.name === "buscarClimaTempoReal") {
                    const r = await buscarClimaTempoReal(call.args.cidade);
                    outputs.push({ functionResponse: { name: "buscarClimaTempoReal", response: r } });
                }
                if (call.name === "adicionarXP") {
                    const r = await adicionarXP(nickname, call.args.quantidade);
                    outputs.push({ functionResponse: { name: "adicionarXP", response: r } });
                }
            }
            result = await chat.sendMessage(outputs);
            response = result.response;
        }

        const respostaFinal = response.text();

        // Salva mensagens
        await Mensagem.create({ role: "user", parts: [{ text: pergunta }], nickname });
        await Mensagem.create({ role: "model", parts: [{ text: respostaFinal }], nickname });

        res.json({ resposta: respostaFinal });

    } catch (error) {
        console.error("❌ ERRO NO SERVIDOR:", error.message);
        res.status(500).json({ erro: "Erro na IA", detalhe: error.message });
    }
});

app.listen(3000, () => console.log('🚀 Servidor em http://localhost:3000'));