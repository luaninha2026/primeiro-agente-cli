const Mensagem = require('../models/Mensagem'); 
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Inicialize a IA aqui dentro
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.enviarMensagem = async (req, res) => {
    try {
        const { pergunta } = req.body;
        if (!pergunta) return res.status(400).json({ erro: "Envie uma pergunta." });

        // 1. Salva pergunta do usuário
        await Mensagem.create({ role: "user", parts: [{ text: pergunta }] });

        // 2. Busca histórico para o contexto (últimas 20)
        const mensagensBanco = await Mensagem.find().sort({ dataHora: 1 }).limit(20).lean();

        // 3. Formata histórico para o Gemini
        const historyParaIA = mensagensBanco.slice(0, -1).map(m => ({
            role: m.role === "user" ? "user" : "model",
            parts: [{ text: m.parts[0].text }]
        }));

        // 4. Configura modelo e envia
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        const chat = model.startChat({ history: historyParaIA });
        const result = await chat.sendMessage(pergunta);
        const respostaDaIA = result.response.text();

        // 5. Salva resposta da IA
        await Mensagem.create({ role: "model", parts: [{ text: respostaDaIA }] });

        res.status(200).json({ sucesso: true, resposta: respostaDaIA });
    } catch (erro) {
        console.error("Erro no Controller:", erro);
        res.status(500).json({ erro: "Erro ao processar a mensagem." });
    }
};

exports.limparHistorico = async (req, res) => {
    try {
        await Mensagem.deleteMany({});
        res.status(200).json({ sucesso: true, mensagem: "Histórico apagado com sucesso!" });
    } catch (erro) {
        res.status(500).json({ erro: "Erro ao limpar histórico." });
    }
};