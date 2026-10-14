const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const server = http.createServer(app);

// 1. Configuração do Socket.io com CORS
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "chave_secreta_super_segura_do_cofre";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/cofre_saas";

// 2. Configuração do Google Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

async function perguntarAoGemini(pergunta) {
    if (!process.env.GEMINI_API_KEY) {
        return "⚠️ Chave GEMINI_API_KEY não configurada no servidor (.env).";
    }
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `Você é o Moderador Gemini de uma sala de chat segura. Responda de forma prestativa, objetiva e amigável em português à seguinte solicitação: ${pergunta}`;
        const resultado = await model.generateContent(prompt);
        return resultado.response.text();
    } catch (err) {
        console.error("Erro na API do Gemini:", err.message);
        return "Desculpe, ocorreu uma instabilidade ao consultar o Guardião Gemini.";
    }
}

// 3. Middlewares do Express
app.use(cors());
app.use(express.json());

// 4. Conexão com MongoDB
mongoose.connect(MONGO_URI)
    .then(() => console.log("📦 Conectado ao MongoDB com sucesso!"))
    .catch((err) => console.error("❌ Erro ao conectar ao MongoDB:", err.message));

// 5. Model de Usuário
const UsuarioSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    senha: { type: String, required: true },
    xp: { type: Number, default: 0 }
});
const Usuario = mongoose.models.Usuario || mongoose.model("Usuario", UsuarioSchema);

// 6. Middleware REST para rotas protegidas
function autenticarToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ erro: "Token não fornecido." });

    jwt.verify(token, JWT_SECRET, (err, usuario) => {
        if (err) return res.status(403).json({ erro: "Token inválido ou expirado." });
        req.usuario = usuario;
        next();
    });
}

// 7. Rotas REST
app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Sistema Operacional" });
});

app.post("/api/auth/register", async (req, res) => {
    try {
        const { nome, email, senha } = req.body;
        if (!nome || !email || !senha) {
            return res.status(400).json({ erro: "Todos os campos são obrigatórios." });
        }
        const usuarioExiste = await Usuario.findOne({ email });
        if (usuarioExiste) {
            return res.status(400).json({ erro: "E-mail já cadastrado." });
        }
        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(senha, salt);
        const novoUsuario = await Usuario.create({ nome, email, senha: senhaHash });
        res.status(201).json({ mensagem: "Cadastro realizado com sucesso!", id: novoUsuario._id });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao cadastrar usuário: " + err.message });
    }
});

app.post("/api/auth/login", async (req, res) => {
    try {
        const { email, senha } = req.body;
        const usuario = await Usuario.findOne({ email });
        if (!usuario) {
            return res.status(400).json({ erro: "E-mail ou senha inválidos." });
        }
        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        if (!senhaValida) {
            return res.status(400).json({ erro: "E-mail ou senha inválidos." });
        }
        const token = jwt.sign(
            { id: usuario._id, nome: usuario.nome, email: usuario.email },
            JWT_SECRET,
            { expiresIn: "24h" }
        );
        res.json({ token, nome: usuario.nome });
    } catch (err) {
        res.status(500).json({ erro: "Erro no login: " + err.message });
    }
});

app.get("/api/ranking", autenticarToken, async (req, res) => {
    try {
        const ranking = await Usuario.find({}, "nome xp").sort({ xp: -1 }).limit(10);
        res.json(ranking);
    } catch (err) {
        res.status(500).json({ erro: "Erro ao buscar ranking." });
    }
});

// Endpoint legado de chat via REST (mantido para compatibilidade)
app.post("/api/chat", autenticarToken, async (req, res) => {
    try {
        const { pergunta } = req.body;
        const resposta = await perguntarAoGemini(pergunta);
        await Usuario.findByIdAndUpdate(req.usuario.id, { $inc: { xp: 10 } });
        res.json({ resposta });
    } catch (err) {
        res.status(500).json({ erro: "Erro no chat." });
    }
});

// -------------------------------------------------------------
// FASE 5: Segurança no WebSocket (Autenticação JWT no Socket.io)
// -------------------------------------------------------------
io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
        return next(new Error("Acesso recusado: Token JWT não fornecido."));
    }
    jwt.verify(token, JWT_SECRET, (err, decodificado) => {
        if (err) {
            return next(new Error("Acesso recusado: Token JWT inválido ou expirado."));
        }
        // Anexa os dados do usuário autenticado na instância do socket
        socket.usuario = decodificado;
        next();
    });
});

// -------------------------------------------------------------
// FASE 2 e 3: Eventos da Sala e Lógica do Bot Moderador
// -------------------------------------------------------------
io.on("connection", (socket) => {
    console.log(`🟢 [Socket.io] Conexão estabelecida: ${socket.usuario.nome} (ID: ${socket.id})`);

    // Escuta novas mensagens enviadas pelo usuário
    socket.on("novaMensagem", async (texto) => {
        if (!texto || typeof texto !== "string" || !texto.trim()) return;

        const conteudoFormatado = texto.trim();
        const horaAtual = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        // Objeto com a identificação completa de quem enviou
        const dadosMensagem = {
            idUsuario: socket.usuario.id,
            autor: socket.usuario.nome,
            texto: conteudoFormatado,
            hora: horaAtual,
            isBot: false
        };

        // 1. Espalha a mensagem do usuário para TODOS conectados instantaneamente
        io.emit("mensagemRecebida", dadosMensagem);

        // 2. Gatilho da IA: Verifica se contém @gemini
        if (conteudoFormatado.toLowerCase().includes("@gemini")) {
            // Remove o gatilho "@gemini" da pergunta para a IA
            const perguntaLimpa = conteudoFormatado.replace(/@gemini/gi, "").trim() || "Olá!";

            try {
                // Obtém a resposta do modelo
                const respostaIA = await perguntarAoGemini(perguntaLimpa);

                // Emite a resposta com o nome padrão do Bot solicitado
                io.emit("mensagemRecebida", {
                    autor: "🤖 Moderador Gemini",
                    texto: respostaIA,
                    hora: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                    isBot: true
                });

                // Bonificação de XP por interagir com o robô
                await Usuario.findByIdAndUpdate(socket.usuario.id, { $inc: { xp: 10 } });
            } catch (erroBot) {
                console.error("Erro ao gerar resposta do bot:", erroBot);
                io.emit("mensagemRecebida", {
                    autor: "🤖 Moderador Gemini",
                    texto: "Erro interno ao processar a resposta.",
                    hora: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                    isBot: true
                });
            }
        }
    });

    socket.on("disconnect", () => {
        console.log(`🔴 [Socket.io] Usuário desconectado: ${socket.usuario.nome} (ID: ${socket.id})`);
    });
});

// IMPORTANTE: usar server.listen e NÃO app.listen para o Socket.io funcionar!
server.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});