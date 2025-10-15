export abstract class BaseEntity {
  abstract validate(): string | null;

  isValid(): boolean {
    return this.validate() === null;
  }

  throwIfInvalid(): void {
    const error = this.validate();
    if (error) {
      throw new Error(`Validation failed: ${error}`);
    }
  }
}
