export interface Pagination {
  afterId?: number;
  beforeId?: number;
}

export interface Paginate {
  nextPage: () => void;
  prevPage: () => void;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}
