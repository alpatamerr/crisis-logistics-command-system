import { Icon } from "@blueprintjs/core";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Optional: current page size */
  pageSize?: number;
  /** Optional: callback when page size changes */
  onPageSizeChange?: (size: number) => void;
  /** Optional: available page size options. Defaults to [10, 25, 50] */
  pageSizeOptions?: number[];
  /** Optional: total item count for display */
  totalItems?: number;
}

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  totalItems,
}: PaginationProps) {
  if (totalPages <= 1 && !onPageSizeChange) {
    return null;
  }

  const getPageNumbers = (): (number | "ellipsis")[] => {
    const pages: (number | "ellipsis")[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      if (currentPage <= 3) {
        for (let i = 2; i <= 4; i++) {
          pages.push(i);
        }
        pages.push("ellipsis");
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push("ellipsis");
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        pages.push("ellipsis");
        pages.push(currentPage - 1);
        pages.push(currentPage);
        pages.push(currentPage + 1);
        pages.push("ellipsis");
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="pagination-wrapper">
      {/* Left: Page Size Selector */}
      <div className="pagination-page-size">
        {onPageSizeChange && (
          <>
            <span className="pagination-label">Show on page by</span>
            <select
              className="pagination-size-select"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </>
        )}
        {totalItems != null && (
          <span className="pagination-total">
            {((currentPage - 1) * (pageSize ?? 25)) + 1}–{Math.min(currentPage * (pageSize ?? 25), totalItems)} of {totalItems}
          </span>
        )}
      </div>

      {/* Right: Page Navigation */}
      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="pagination-btn"
            disabled={currentPage === 1}
            onClick={() => onPageChange(currentPage - 1)}
          >
            <Icon icon="chevron-left" size={12} />
          </button>

          {pageNumbers.map((page, idx) =>
            page === "ellipsis" ? (
              <span key={`ellipsis-${idx}`} className="pagination-ellipsis">
                …
              </span>
            ) : (
              <button
                key={page}
                className={`pagination-btn pagination-num ${currentPage === page ? "pagination-active" : ""}`}
                onClick={() => onPageChange(page)}
              >
                {page}
              </button>
            )
          )}

          <button
            className="pagination-btn"
            disabled={currentPage === totalPages}
            onClick={() => onPageChange(currentPage + 1)}
          >
            <Icon icon="chevron-right" size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
