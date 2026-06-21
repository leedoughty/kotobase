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

export interface JMdictSense {
  partOfSpeech: string[];
  appliesToKanji: string[];
  appliesToKana: string[];
  field: string[];
  dialect: string[];
  misc: string[];
  info: string[];
  gloss: JMdictGloss[];
}

export interface JMdictWord {
  id: string;
  kanji: JMdictKanji[];
  kana: JMdictKana[];
  sense: JMdictSense[];
}
