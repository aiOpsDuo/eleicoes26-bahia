// Erro de carregamento de dados (status HTTP + mensagem), comum aos modos api e estatico.
export class ErroApi extends Error {
  constructor(status, mensagem) {
    super(mensagem)
    this.status = status
  }
}
