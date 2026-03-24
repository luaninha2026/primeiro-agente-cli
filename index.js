require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const port = 5000;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.post('/perguntar', async (req, res) => {
    // Recebe a pergunta e o modelo escolhido
    const { pergunta, modelo } = req.body;
    
    // Mapeamento: se o usuário escolher 2.5 ou 3.0, usamos o 1.5-flash para não dar erro
    // Já que as versões 2.5 e 3.0 ainda não foram lançadas pelo Google.
    let modelName = "gemini-3-flash-preview"; 
    if (modelo === "gemini-2.5-pro") modelName = "gemini-2.5-pro";
    if (modelo === "gemini-3.0-pro") modelName = "gemini-3.0-pro";
    if (modelo === "gemini-1.5-pro") modelName = "gemini-1.5-pro";

    try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const prompt = `Você é Bob Esponja, o personagem animado. Responda de forma animada, divertida e como se estivesse no fundo do mar com seus amigos Patrick, Lula Molusco e Senhor Sirigueijo. Use expressões como "Eu sou o Bob Esponja!", "Vamos fazer hambúrgueres de siri!" ou outras referências ao show. Responda à pergunta: ${pergunta}`;
        const result = await model.generateContent(prompt);
        const resposta = result.response.text();
        res.json({ resposta });
    } catch (error) {
        console.error("Erro na IA:", error.message);
        res.status(500).json({ erro: "Erro ao conectar com este modelo de IA." });
    }
});

app.listen(port, () => {
    console.log(`🚀 Chat com troca de modelo em http://localhost:${port}`);
});