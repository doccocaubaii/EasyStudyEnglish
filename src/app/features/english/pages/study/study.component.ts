import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GoogleSheetsService, WordModel } from '../../../../core/services/google-sheets.service';
import { DictionaryService } from '../../../../core/services/dictionary.service';

@Component({
  selector: 'app-study',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './study.component.html',
  styleUrl: './study.component.scss'
})
export class StudyComponent implements OnInit {
  newWordsCount = 10;
  selectedWords: WordModel[] = [];
  isMarkingLearned = false;
  
  // Tab state
  activeTab: 'new' | 'review' = 'new';
  
  // Review state
  reviewWords: WordModel[] = [];
  currentReviewIndex = 0;
  showAnswer = false;

  constructor(
    public sheetsService: GoogleSheetsService,
    private dictionaryService: DictionaryService
  ) {}

  async ngOnInit() {
    await this.sheetsService.getWords();
    this.loadReviewWords();
  }

  private failedWords = new Set<string>();

  async fetchNewWords() {
    this.selectedWords = this.sheetsService.getNewWords(this.newWordsCount);
    
    // Tự động bổ sung thông tin từ điển nếu thiếu
    for (const word of this.selectedWords) {
      const shouldFetch = !word.pronunciation || !word.audioUrl;
      const isAlreadyChecked = word.definition === '---' || word.pronunciation === '---';

      if (shouldFetch && !isAlreadyChecked) {
        const data = await this.dictionaryService.getDefinition(word.wordE);
        
        const newPronunciation = data?.phonetic || word.pronunciation || '---';
        const newAudioUrl = data?.phonetics.find(p => p.audio)?.audio || word.audioUrl || '---';

        if (newPronunciation !== word.pronunciation || newAudioUrl !== word.audioUrl) {
          word.pronunciation = newPronunciation;
          word.audioUrl = newAudioUrl;

          // Tự động cập nhật lên Sheet ngay lập tức
          const dataToSave = [
            word.id,
            word.learnTime || new Date().toLocaleString(),
            word.wordE,
            word.pronunciation,
            word.meaning,
            word.definition || '---',
            word.learnCount,
            word.audioUrl,
            word.example,
            word.isDeleted ? 'TRUE' : 'FALSE',
            word.easinessFactor,
            word.intervalDays,
            word.repetitionStreak,
            word.nextReviewDate
          ];
          
          this.sheetsService.updateWord(word.row, dataToSave).catch(err => {
            console.error(`Tự động đồng bộ từ "${word.wordE}" thất bại:`, err);
          });
        }
      }
    }
  }

  async confirmLearned() {
    if (this.selectedWords.length === 0) return;
    
    if (confirm(`Xác nhận bạn đã học xong ${this.selectedWords.length} từ này? Hệ thống sẽ bắt đầu tính lịch ôn tập từ ngày mai.`)) {
      this.isMarkingLearned = true;
      try {
        await this.sheetsService.markAsLearned(this.selectedWords);
        this.selectedWords = [];
        alert('Chúc mừng! Bạn đã hoàn thành bài học mới.');
      } catch (err) {
        console.error('Lỗi khi đánh dấu đã học:', err);
        alert('Có lỗi xảy ra, vui lòng thử lại.');
      } finally {
        this.isMarkingLearned = false;
      }
    }
  }

  // --- Review Logic ---
  
  loadReviewWords() {
    const today = new Date().toISOString().split('T')[0];
    this.reviewWords = this.sheetsService.cachedWords.filter(w => 
      !w.isDeleted && 
      w.learnCount > 0 && 
      w.nextReviewDate <= today
    );
    this.currentReviewIndex = 0;
    this.showAnswer = false;
  }

  get currentWord(): WordModel | null {
    return this.reviewWords[this.currentReviewIndex] || null;
  }

  flipCard() {
    this.showAnswer = !this.showAnswer;
  }

  async submitReview(isCorrect: boolean) {
    const word = this.currentWord;
    if (!word) return;

    await this.sheetsService.updateSRSResult(word, isCorrect);
    
    this.showAnswer = false;
    this.currentReviewIndex++;
    
    if (this.currentReviewIndex >= this.reviewWords.length) {
      alert('Bạn đã hoàn thành tất cả các từ cần ôn tập hôm nay!');
      this.loadReviewWords();
    }
  }

  openDictionary(type: 'google' | 'oxford', word: string) {
    const electronAPI = (window as any).electronAPI;
    let url = '';
    if (type === 'google') {
      url = `https://translate.google.com/?sl=en&tl=vi&text=${encodeURIComponent(word)}&op=translate`;
    } else {
      url = `https://www.oxfordlearnersdictionaries.com/definition/english/${encodeURIComponent(word.toLowerCase())}`;
    }

    if (electronAPI) {
      electronAPI.openExternalUrl(url);
    } else {
      window.open(url, '_blank');
    }
  }

  playAudio(url: string | undefined) {
    if (!url) return;
    const audio = new Audio(url);
    audio.play().catch(err => console.error('Audio play failed:', err));
  }
}
