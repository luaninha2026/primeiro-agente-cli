const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UsuarioSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    senha: { type: String, required: true }
});

// CRIPTOGRAFIA CORRIGIDA (Sem o parâmetro 'next')
UsuarioSchema.pre('save', async function() {
    // Se a senha não foi modificada, não faz nada
    if (!this.isModified('senha')) return;

    try {
        const salt = await bcrypt.genSalt(10);
        this.senha = await bcrypt.hash(this.senha, salt);
        // Não precisa chamar next() quando a função é async!
    } catch (error) {
        throw error;
    }
});

module.exports = mongoose.model('Usuario', UsuarioSchema);