const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ erro: "Acesso negado. Token ausente." });
    }

    try {
        const verificado = jwt.verify(token, process.env.JWT_SECRET);
        req.usuario = verificado;
        next(); // Continua para o Chat
    } catch (err) {
        return res.status(401).json({ erro: "Token inválido ou expirado." });
    }
};

// ESSA LINHA ABAIXO É OBRIGATÓRIA!
module.exports = authMiddleware;