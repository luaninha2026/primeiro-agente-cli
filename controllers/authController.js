const Usuario = require('../models/Usuario');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
    try {
        const { nome, email, senha } = req.body;

        // 1. Verificar se os dados chegaram
        if (!nome || !email || !senha) {
            return res.status(400).json({ erro: "Preencha todos os campos!" });
        }

        // 2. Verificar se o usuário já existe
        const usuarioExistente = await Usuario.findOne({ email });
        if (usuarioExistente) {
            return res.status(400).json({ erro: "Este e-mail já está cadastrado." });
        }

        // 3. Criar e salvar
        const novoUsuario = new Usuario({ nome, email, senha });
        await novoUsuario.save();

        res.status(201).json({ mensagem: "Usuário criado com sucesso!" });
    } catch (error) {
        console.error("ERRO NO CADASTRO:", error); // Isso vai aparecer no seu terminal!
        res.status(500).json({ erro: "Erro ao salvar no banco", detalhe: error.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, senha } = req.body;
        const usuario = await Usuario.findOne({ email });
        if (!usuario) return res.status(400).json({ erro: "Usuário não encontrado" });

        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        if (!senhaValida) return res.status(400).json({ erro: "Senha incorreta" });

        const token = jwt.sign(
            { id: usuario._id, nome: usuario.nome },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({ token, nome: usuario.nome });
    } catch (error) {
        res.status(500).json({ erro: "Erro no login" });
    }
};