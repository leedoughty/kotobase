export interface JMdictKanji {
  common: boolean;
  text: string;
  tags: string[];
}

export interface JMdictKana {
  common: boolean;
  text: string;
  tags: string[];
  appliesToKanji: string[];
}

export interface JMdictGloss {
  lang: string;
  gender: string | null;
  type: string | null;
  text: string;
}

export interface JMdictExampleSentence {
  lang: string;
  text: string;
}

export interface JMdictExampleSource {
  type: string;
  value: string;
}

export interface JMdictExample {
  source: JMdictExampleSource;
  text: string;
  sentences: JMdictExampleSentence[];
}

export interface JMdictSense {
  partOfSpeech: string[];
  appliesToKanji: string[];
  appliesToKana: string[];
  field: string[];
  dialect: string[];
  misc: string[];
  info: string[];
  gloss: JMdictGloss[];
  examples?: JMdictExample[];
}

export interface JMdictWord {
  id: string;
  kanji: JMdictKanji[];
  kana: JMdictKana[];
  sense: JMdictSense[];
}
