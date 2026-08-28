export function StreamGuide() {
  return (
    <div className="stack">
      <p>
        O Bion Live toca o áudio da apresentadora no seu computador. Você só precisa dizer ao programa de transmissão
        que ele deve capturar o som do sistema — <strong>sem instalar cabo de áudio virtual, sem driver, sem extensão</strong>.
      </p>
      <div className="guide-grid">
        <div>
          <h4>No TikTok LIVE Studio</h4>
          <ol className="steps">
            <li>Abra Configurações → Áudio.</li>
            <li>Ligue <strong>Áudio do sistema / Desktop audio</strong>.</li>
            <li>Deixe esta aba aberta enquanto a live roda.</li>
          </ol>
        </div>
        <div>
          <h4>No OBS Studio</h4>
          <ol className="steps">
            <li>Fontes → + → <strong>Captura de saída de áudio</strong>.</li>
            <li>Escolha a saída padrão (a mesma caixa/fone que você ouve).</li>
            <li>Confira o medidor de volume mexendo quando a IA falar.</li>
          </ol>
        </div>
      </div>
      <p className="muted">
        Dica: use fone de ouvido no microfone para que a voz da IA não volte com eco quando você assumir a live.
      </p>
    </div>
  );
}
