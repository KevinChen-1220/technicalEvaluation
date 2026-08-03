export class MissingTrustedOpenIdError extends Error {
  constructor() {
    super('Trusted WeChat OPENID is required.');
    this.name = 'MissingTrustedOpenIdError';
  }
}

export class RecordOwnershipError extends Error {
  constructor() {
    super('The trusted WeChat OPENID does not own this record.');
    this.name = 'RecordOwnershipError';
  }
}

export class InvalidContractInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidContractInputError';
  }
}
