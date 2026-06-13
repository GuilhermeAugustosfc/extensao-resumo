document.addEventListener('DOMContentLoaded', () => {
  const grantBtn = document.getElementById('grant-btn');
  const requestCard = document.getElementById('request-card');
  const successCard = document.getElementById('success-card');

  // Verificar se o microfone já está autorizado
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'microphone' }).then((permissionStatus) => {
      if (permissionStatus.state === 'granted') {
        showSuccessState('O acesso ao microfone já estava concedido! Fechando a aba...');
      }
    });
  }

  grantBtn.addEventListener('click', async () => {
    try {
      // Solicitar permissão do microfone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Permissão concedida! Desativar o stream de teste imediatamente
      stream.getTracks().forEach(track => track.stop());

      // Mostrar card de sucesso
      showSuccessState('Obrigado! O acesso ao microfone foi configurado com sucesso. Esta aba será fechada automaticamente em instantes e você poderá usar a funcionalidade Live.');
    } catch (err) {
      console.error('[Permission] Erro ao obter permissão do microfone:', err);
      
      if (err.name === 'NotAllowedError') {
        alert('O acesso ao microfone foi negado. Por favor, clique no ícone de cadeado na barra de endereços (à esquerda da URL) e altere a permissão para "Permitir" e tente novamente.');
      } else {
        alert('Erro ao acessar o microfone: ' + err.message);
      }
    }
  });

  function showSuccessState(descText) {
    requestCard.style.display = 'none';
    successCard.style.display = 'block';
    if (descText) {
      document.getElementById('success-desc').textContent = descText;
    }
    
    // Fechar aba após 2 segundos
    setTimeout(() => {
      window.close();
    }, 2200);
  }
});
