import { useId } from 'react';
import { dateTime } from './components';
import type { BatchTrend, BatchTrendInterval } from './types';

export function ProjectTrend({
  trend,
  interval,
  url,
}: {
  trend: BatchTrend;
  interval: BatchTrendInterval;
  url: string;
}) {
  const titleId = useId();
  const series = trend.series.find((item) => item.url === url);
  if (!series) return null;
  const x = (index: number) => 42 + index * (626 / Math.max(1, trend.periods.length - 1));
  const y = (score: number) => 180 - score * 1.5;
  const label = (index: number) =>
    interval === 'weekly' ? trend.periods[index].label.slice(0, 5) : trend.periods[index].label;
  const hasMeasurements = series.points.some((point) => point.score != null);
  return (
    <div className="project-trend-visual">
      <svg viewBox="0 0 700 225" role="img" aria-labelledby={titleId}>
        <title id={titleId}>
          Điểm của {url} trong 12 {interval === 'weekly' ? 'tuần' : 'tháng'}. Xem bảng số liệu bên
          dưới.
        </title>
        {[0, 25, 50, 75, 100].map((score) => (
          <g key={score}>
            <line x1="42" x2="668" y1={y(score)} y2={y(score)} stroke="#e1e8dc" />
            <text x="30" y={y(score) + 4} textAnchor="end" fill="#5f6f55" fontSize="11">
              {score}
            </text>
          </g>
        ))}
        {series.points.map((point, index) => {
          const previous = series.points[index - 1];
          return (
            <g key={point.period}>
              {point.score != null && previous?.score != null && point.comparable && (
                <line
                  x1={x(index - 1)}
                  y1={y(previous.score)}
                  x2={x(index)}
                  y2={y(point.score)}
                  stroke="#36745a"
                  strokeWidth="2.5"
                />
              )}
              {point.score != null ? (
                <g>
                  <circle
                    cx={x(index)}
                    cy={y(point.score)}
                    r="5"
                    fill="#36745a"
                    stroke="white"
                    strokeWidth="2"
                  >
                    <title>
                      {trend.periods[index].label}: {point.score}/100 ·{' '}
                      {point.measuredAt ? dateTime(point.measuredAt) : ''} · {point.source}
                    </title>
                  </circle>
                  <text
                    x={x(index)}
                    y={y(point.score) - 11}
                    textAnchor="middle"
                    fill="#365a40"
                    fontSize="12"
                    fontWeight="600"
                  >
                    {point.score}
                  </text>
                </g>
              ) : (
                <text x={x(index)} y="197" textAnchor="middle" fill="#65735c" fontSize="11">
                  —
                </text>
              )}
              {[0, 3, 6, 9, 11].includes(index) && (
                <text x={x(index)} y="218" textAnchor="middle" fill="#5f6f55" fontSize="10">
                  {label(index)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {!hasMeasurements && (
        <p className="project-section-hint">Chưa có điểm đo trong khoảng thời gian này.</p>
      )}
      <p className="project-section-hint trend-explanation">
        Mỗi kỳ lấy phép đo cuối cùng. Chỉ nối các kỳ liền nhau có kết quả tương thích; dấu — là chưa
        có điểm. Tuần bắt đầu vào thứ Hai, múi giờ Việt Nam (UTC+7).
      </p>
      <details className="comparison-details trend-data">
        <summary>Xem bảng số liệu 12 {interval === 'weekly' ? 'tuần' : 'tháng'}</summary>
        <div className="trend-table-wrap">
          <table>
            <caption>Điểm từng kỳ của {url}</caption>
            <thead>
              <tr>
                <th scope="col">{interval === 'weekly' ? 'Tuần từ' : 'Tháng'}</th>
                <th scope="col">Điểm</th>
                <th scope="col">Lần đo / nguồn</th>
                <th scope="col">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {series.points.map((point, index) => (
                <tr key={point.period}>
                  <th scope="row">{trend.periods[index].label}</th>
                  <td>{point.score ?? '—'}</td>
                  <td>
                    {point.measuredAt ? dateTime(point.measuredAt) : 'Chưa có'}
                    <small>{point.source}</small>
                  </td>
                  <td>
                    {point.reason ||
                      (point.comparable
                        ? 'Có thể đối chiếu với kỳ liền trước.'
                        : 'Mốc đo trong kỳ.')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
