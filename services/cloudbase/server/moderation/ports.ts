export type ModerationScene = 'generation_input' | 'generation_output';

export type TextModerationInput = {
  ownerOpenId: string;
  content: string;
  scene: ModerationScene;
  title: string;
};

export type TextModerationDecision = { allowed: true } | { allowed: false };

export type TextModerationPort = {
  checkText(input: TextModerationInput): Promise<TextModerationDecision>;
};

export const allowAllTextModeration: TextModerationPort = {
  async checkText() {
    return { allowed: true };
  },
};

export const denyAllTextModeration: TextModerationPort = {
  async checkText() {
    return { allowed: false };
  },
};
