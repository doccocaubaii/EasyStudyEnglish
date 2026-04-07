import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { GoogleSheetsService, WordModel } from '../../../../core/services/google-sheets.service';
import { DictionaryService } from '../../../../core/services/dictionary.service';

@Component({
  selector: 'app-list-word',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './list-word.component.html',
  styleUrl: './list-word.component.scss'
})
export class ListWordComponent implements OnInit {
  words: WordModel[] = [];

  // Modal state
  showEditModal = false;
  isEditMode = false;
  editForm: FormGroup;
  currentEditingRow: WordModel | null = null;
  saving = false;

  // Pagination state
  currentPage = 1;
  pageSize = 50;
  pageSizes = [10, 20, 30, 50, 100];
  jumpToPageInput: string = '';
  protected Math = Math; // Expose Math to template

  get totalPages(): number {
    return Math.ceil((this.words?.length || 0) / this.pageSize);
  }

  get paginatedWords(): WordModel[] {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.words.slice(start, end);
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.goToPage(this.currentPage + 1);
    }
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.goToPage(this.currentPage - 1);
    }
  }

  goToPage(page: number | string) {
    const pageNum = typeof page === 'string' ? parseInt(page) : page;
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= this.totalPages) {
      this.currentPage = pageNum;
      this.jumpToPageInput = ''; // Reset input
      this.enrichCurrentPage();
    }
  }

  onPageSizeChange(event: Event) {
    const newSize = +(event.target as HTMLSelectElement).value;
    this.pageSize = newSize;
    this.currentPage = 1; // Reset to page 1 when size changes
    this.enrichCurrentPage();
  }

  onJumpToPage(event: any) {
    const page = parseInt(event.target.value);
    if (!isNaN(page)) {
      this.goToPage(page);
    }
  }

  /**
   * Sinh danh sách trang hiển thị mượt mà: 1, 2, ..., 5, 6, 7, ..., 10
   */
  getVisiblePages(): (number | string)[] {
    const total = this.totalPages;
    const current = this.currentPage;
    const delta = 2; // Số trang hiển thị quanh trang hiện tại
    const range: (number | string)[] = [];

    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
        range.push(i);
      } else if (range[range.length - 1] !== '...') {
        range.push('...');
      }
    }
    return range;
  }

  constructor(
    public sheetsService: GoogleSheetsService,
    private dictionaryService: DictionaryService,
    private fb: FormBuilder
  ) {
    this.editForm = this.fb.group({
      word: ['', Validators.required],
      meaning: ['', Validators.required],
      pronunciation: [''],
      definition: [''],
      audioUrl: [''],
      example: ['']
    });
  }

  async ngOnInit() {
    await this.loadData();
  }

  async loadData() {
    this.words = await this.sheetsService.getWords();
    this.enrichCurrentPage();
  }

  async syncData() {
    this.words = await this.sheetsService.syncWithSheet();
    this.currentPage = 1;
    this.enrichCurrentPage();
  }

  async deleteWord(word: WordModel) {
    if (confirm(`Bạn có chắc muốn xóa từ "${word.wordE}"?`)) {
      await this.sheetsService.deleteWord(word);
      await this.loadData();
    }
  }

  async enrichCurrentPage() {
    const currentPageWords = this.paginatedWords;
    for (const word of currentPageWords) {
      // Chỉ gọi API nếu các thông tin quan trọng bị thiếu
      if (!word.pronunciation || !word.definition || !word.audioUrl) {
        const data = await this.dictionaryService.getDefinition(word.wordE);
        if (data) {
          const firstMeaning = data.meanings[0];
          
          // 1. Cập nhật Model (để hiển thị UI)
          const newPronunciation = word.pronunciation || data.phonetic || '';
          const newDefinition = word.definition || firstMeaning?.definitions[0]?.definition || '';
          const newAudioUrl = word.audioUrl || data.phonetics.find(p => p.audio)?.audio || '';

          // 2. Chỉ thực hiện UPDATE nếu có thông tin mới thực sự
          if (newPronunciation !== word.pronunciation || 
              newDefinition !== word.definition || 
              newAudioUrl !== word.audioUrl) {
            
            word.pronunciation = newPronunciation;
            word.definition = newDefinition;
            word.audioUrl = newAudioUrl;

            // 3. Tự động đẩy lên Sheet (Thứ tự 14 cột chuẩn)
            const dataToSave = [
              word.id,
              word.learnTime || new Date().toLocaleString(),
              word.wordE,
              word.pronunciation,
              word.meaning,
              word.definition,
              word.learnCount,
              word.audioUrl,
              word.example,
              word.isDeleted ? 'TRUE' : 'FALSE',
              word.easinessFactor,
              word.intervalDays,
              word.repetitionStreak,
              word.nextReviewDate
            ];
            
            // Gọi âm thầm, không cần await để tránh đứng UI
            this.sheetsService.updateWord(word.row, dataToSave).catch(err => {
              console.error(`Tự động đồng bộ từ "${word.wordE}" thất bại:`, err);
            });
          }
        }
      }
    }
  }

  playAudio(url: string | undefined) {
    if (!url) return;
    const audio = new Audio(url);
    audio.play().catch(err => console.error('Audio play failed:', err));
  }

  openAddModal() {
    this.isEditMode = false;
    this.editForm.reset({
      word: '',
      meaning: '',
      pronunciation: '',
      definition: '',
      audioUrl: '',
      example: ''
    });
    this.showEditModal = true;
  }

  openEditModal(word: WordModel) {
    this.isEditMode = true;
    this.currentEditingRow = word;
    this.editForm.patchValue({
      word: word.wordE,
      meaning: word.meaning,
      pronunciation: word.pronunciation,
      definition: word.definition,
      audioUrl: word.audioUrl,
      example: word.example
    });
    this.showEditModal = true;
  }

  closeModal() {
    this.showEditModal = false;
    this.editForm.reset();
    this.currentEditingRow = null;
  }

  async submitForm() {
    if (this.editForm.invalid) return;

    this.saving = true;
    try {
      const formData = this.editForm.value;
      const wordData: Partial<WordModel> = {
        wordE: formData.word,
        meaning: formData.meaning,
        pronunciation: formData.pronunciation,
        definition: formData.definition,
        audioUrl: formData.audioUrl,
        example: formData.example
      };

      if (this.isEditMode && this.currentEditingRow) {
        // CHẾ ĐỘ CẬP NHẬT
        // Lưu ý: UpdateWord nhận mảng data 14 cột
        const dataToSave = [
          this.currentEditingRow.id,
          this.currentEditingRow.learnTime,
          wordData.wordE,
          wordData.pronunciation,
          wordData.meaning,
          wordData.definition,
          this.currentEditingRow.learnCount,
          wordData.audioUrl,
          wordData.example,
          this.currentEditingRow.isDeleted ? 'TRUE' : 'FALSE',
          this.currentEditingRow.easinessFactor,
          this.currentEditingRow.intervalDays,
          this.currentEditingRow.repetitionStreak,
          this.currentEditingRow.nextReviewDate
        ];
        await this.sheetsService.updateWord(this.currentEditingRow.row, dataToSave);
      } else {
        // CHẾ ĐỘ THÊM MỚI
        await this.sheetsService.addWord(wordData);
      }

      this.closeModal();
      await this.loadData();
    } catch (err) {
      console.error('Operation failed:', err);
      alert('Thao tác thất bại. Vui lòng thử lại.');
    } finally {
      this.saving = false;
    }
  }
}
