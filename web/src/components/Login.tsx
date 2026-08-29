import { useState } from 'react';
import { api } from '../api';

export function Login({ onEntrar, senhaMalformada }: { onEntrar: () => Promise<void>; senhaMalformada?: boolean }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function entrar(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setOcupado(true);
    setErro('');
    try {
      await api.login(senha);
      setSenha('');
      await onEntrar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="login">
      <form className="card" onSubmit={entrar}>
        <h1>Bion Live</h1>
        {senhaMalformada ? (
          <p className="error">
            A senha configurada no servidor tem quebra de linha, então não existe como digitá-la aqui. Corrija a
            variável <code>BION_SENHA</code> na hospedagem — ela precisa ficar em uma linha só.
          </p>
        ) : (
          <p className="muted">Esta instalação é protegida por senha.</p>
        )}
        <input
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="Senha"
          autoFocus
          autoComplete="current-password"
        />
        <button className="btn primary" disabled={ocupado || !senha}>
          {ocupado ? 'Entrando…' : 'Entrar'}
        </button>
        {erro && <p className="error">{erro}</p>}
      </form>
    </div>
  );
}
