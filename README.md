# CEN BibleMaps PWA Release v1.0

Map First 원칙 기반 배포용 최종 PWA입니다.

## 핵심 파일

- `index.html`
- `app.js`
- `styles.css`
- `manifest.webmanifest`
- `service-worker.js`
- `data/places-master.json`
- `data/map-master.json`
- `data/place-map-links-master.json`

## 원칙

- 지명 검색이 최우선입니다.
- `지도보기` 버튼은 하나만 유지합니다.
- 고해상도 URL이 있으면 자동으로 고해상도 지도를 열고, 없으면 대한성서공회 공식 gXX 지도를 엽니다.
- 기본 지도/고해상도 지도 선택 버튼은 노출하지 않습니다.


## BMPI Keyword v1.1
- place-map-links-master.json replaced with BMPI-generated direct-visible links.
- map-label-aliases.json added.
- App search restricted to BMPI visible place labels and aliases, not people/event/summary keywords.


## 2026-06-29 External URL Test
- 사용자 제공 외부 지도 URL 반영: 58건
- URL 공란 검토 목록: 46건 (`data/external-map-links-missing-url-review.csv`)
- 최종 배포 전 실제 지도 표기 QA 필요
