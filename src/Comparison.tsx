import { useState } from 'react';
import { ArrowRight, Info, Search, TriangleAlert } from 'lucide-react';
import { categoryKeys, categoryMeta, dateTime } from './components';
import type { Category, ChangeGroup, ReportComparison } from './types';

const groups: { id: ChangeGroup; label: string; empty: string }[] = [
  { id: 'new', label: 'Lỗi mới', empty: 'Không phát hiện lỗi mới trên các URL đã được đối chiếu.' },
  {
    id: 'persistent',
    label: 'Còn tồn tại',
    empty: 'Không có vấn đề được xác nhận còn tồn tại trong cả hai lần.',
  },
  {
    id: 'resolved',
    label: 'Đã sửa',
    empty: 'Chưa có lỗi nào được xác nhận đã sửa bằng lần quét mới.',
  },
  {
    id: 'unverified',
    label: 'Chưa đủ dữ liệu',
    empty: 'Các kết quả đã có đủ dữ liệu để đối chiếu.',
  },
];
const states: Record<string, string> = {
  pass: 'Đạt',
  fail: 'Có lỗi',
  warn: 'Cần cải thiện',
  unknown: 'Chưa xác minh',
  unmeasured: 'Chưa đo',
};

export function ComparisonDetails({ data }: { data: ReportComparison }) {
  const [group, setGroup] = useState<ChangeGroup>('new');
  const [category, setCategory] = useState<'all' | Category>('all');
  const [query, setQuery] = useState('');
  const selected = groups.find((g) => g.id === group)!;
  const findings = data.changes[group].filter(
    (finding) =>
      (category === 'all' || finding.category === category) &&
      `${finding.title} ${finding.url}`
        .toLocaleLowerCase('vi')
        .includes(query.toLocaleLowerCase('vi')),
  );
  return (
    <>
      <div className="comparison-head">
        {[data.before, data.after].map((r, i) => (
          <div key={r.id}>
            <span>{i ? 'Báo cáo mới hơn' : 'Báo cáo trước'}</span>
            <strong>{r.title}</strong>
            <small>
              {dateTime(r.createdAt)} · {r.device} · {r.scope.scannedPages} trang
            </small>
            <small className="comparison-url">{r.url}</small>
          </div>
        ))}
      </div>
      {data.warnings.map((warning) => (
        <div className="comparison-warning" key={warning}>
          <TriangleAlert size={17} />
          <span>{warning}</span>
        </div>
      ))}
      <div className="table-scroll">
        <table className="comparison-table">
          <thead>
            <tr>
              <th>Hạng mục</th>
              <th>Trước</th>
              <th>Mới hơn</th>
              <th>Thay đổi</th>
            </tr>
          </thead>
          <tbody>
            {data.scoreChanges.map((row) => (
              <tr key={row.id}>
                <td>{row.label}</td>
                <td>{row.before ?? '—'}</td>
                <td>{row.after ?? '—'}</td>
                <td>
                  <span
                    className={
                      row.delta === null || row.delta === 0
                        ? ''
                        : row.delta > 0
                          ? 'text-green'
                          : 'text-red'
                    }
                  >
                    {row.delta === null
                      ? row.reason
                      : row.delta === 0
                        ? 'Không đổi'
                        : `${row.delta > 0 ? '+' : ''}${row.delta} điểm`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="comparison-section-title">
        <h3>Thay đổi theo từng lỗi và URL</h3>
        <p>
          {data.coverage.commonPages} trang và {data.coverage.commonLinks} liên kết được kiểm tra
          trong cả hai lần.
        </p>
      </div>
      <div className="change-groups" aria-label="Nhóm thay đổi">
        {groups.map((item) => (
          <button
            key={item.id}
            aria-pressed={group === item.id}
            className={`change-group ${item.id} ${group === item.id ? 'active' : ''}`}
            onClick={() => setGroup(item.id)}
          >
            <strong>{data.counts[item.id]}</strong>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <div className="change-filters">
        <label className="change-search">
          <Search size={16} />
          <input
            aria-label="Tìm lỗi hoặc URL"
            placeholder="Tìm lỗi hoặc URL…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          aria-label="Lọc thay đổi theo hạng mục"
          value={category}
          onChange={(event) => setCategory(event.target.value as 'all' | Category)}
        >
          <option value="all">Tất cả hạng mục</option>
          {categoryKeys.map((id) => (
            <option key={id} value={id}>
              {categoryMeta[id].label}
            </option>
          ))}
        </select>
      </div>
      <div className="change-results" aria-live="polite">
        <p className="change-result-count">
          {findings.length} kết quả · {selected.label}
        </p>
        {findings.length ? (
          findings.map((finding) => (
            <article className="finding-change" key={finding.id}>
              <div className="finding-title">
                <span>{categoryMeta[finding.category].label}</span>
                <h4>{finding.title}</h4>
              </div>
              <p className="finding-url">{finding.url}</p>
              <div className="finding-states">
                <span>{states[finding.before]}</span>
                <ArrowRight size={14} />
                <span>{states[finding.after]}</span>
              </div>
              <p>{finding.reason}</p>
              {(finding.evidenceBefore.length > 0 || finding.evidenceAfter.length > 0) && (
                <details>
                  <summary>Xem bằng chứng hai lần đo</summary>
                  <div className="finding-evidence">
                    <div>
                      <strong>Trước</strong>
                      {finding.evidenceBefore.length ? (
                        finding.evidenceBefore.map((e, i) => <p key={i}>{e}</p>)
                      ) : (
                        <p>Không ghi nhận vấn đề.</p>
                      )}
                    </div>
                    <div>
                      <strong>Mới hơn</strong>
                      {finding.evidenceAfter.length ? (
                        finding.evidenceAfter.map((e, i) => <p key={i}>{e}</p>)
                      ) : (
                        <p>
                          {finding.after === 'unmeasured'
                            ? 'Chưa kiểm tra lại.'
                            : 'Không ghi nhận vấn đề.'}
                        </p>
                      )}
                    </div>
                  </div>
                </details>
              )}
            </article>
          ))
        ) : (
          <div className="change-empty">
            <Info size={22} />
            <p>
              {query || category !== 'all'
                ? 'Không có kết quả phù hợp với bộ lọc.'
                : selected.empty}
            </p>
          </div>
        )}
      </div>
      <p className="comparison-note">
        “Đã sửa” cần kết quả đo lại đạt trên cùng URL. Việc đánh dấu hoàn thành không chứng minh lỗi
        đã được sửa. Lỗi trên URL mới quét hoặc thiếu dữ liệu nằm trong nhóm “Chưa đủ dữ liệu”.
      </p>
    </>
  );
}
