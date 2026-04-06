import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface DictionaryEntry {
  word: string;
  phonetic?: string;
  phonetics: { text?: string; audio?: string }[];
  meanings: {
    partOfSpeech: string;
    definitions: { definition: string; example?: string }[];
  }[];
}

@Injectable({
  providedIn: 'root'
})
export class DictionaryService {
  private readonly API_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
  private cache = new Map<string, DictionaryEntry | null>();

  constructor(private http: HttpClient) {}

  async getDefinition(word: string): Promise<DictionaryEntry | null> {
    const cleanWord = word.trim().toLowerCase();
    if (this.cache.has(cleanWord)) {
      return this.cache.get(cleanWord)!;
    }

    try {
      const response = this.http.get<DictionaryEntry[]>(`${this.API_URL}${cleanWord}`);
      const data = await firstValueFrom(response);
      const result = data && data.length > 0 ? data[0] : null;
      this.cache.set(cleanWord, result);
      return result;
    } catch (error) {
      console.warn(`Không tìm thấy định nghĩa cho từ: ${word}`);
      this.cache.set(cleanWord, null);
      return null;
    }
  }

  /**
   * Lấy Audio URL đầu tiên có dữ liệu
   */
  getAudioUrl(entry: DictionaryEntry | null): string | null {
    if (!entry) return null;
    return entry.phonetics.find(p => p.audio && p.audio !== '')?.audio || null;
  }

  /**
   * Lấy nghĩa đầu tiên
   */
  getDefinitionText(entry: DictionaryEntry | null): string | null {
    if (!entry || !entry.meanings.length) return null;
    const firstMeaning = entry.meanings[0];
    const firstDef = firstMeaning.definitions[0];
    return `(${firstMeaning.partOfSpeech}) ${firstDef.definition}`;
  }
}
