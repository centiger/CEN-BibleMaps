# CEN BibleMaps v1.3.6 Google Fallback Context Hotfix

- Google Maps fallback 검색어를 한국어 지명 단독 검색에서 성경지명+영문명+지역 힌트 방식으로 수정했습니다.
- 예: 아벡 → Aphek biblical site Syria/Israel 계열 검색으로 오탐(카페, 상호명) 방지.
- app.js에서 Google fallback URL을 열 때도 현재 Place 정보로 동적 보정합니다.
- data/place-map-links-master.json의 Google fallback URL 111건도 함께 갱신했습니다.

업로드: 기존 파일 덮어쓰기. 특히 app.js, data/place-map-links-master.json, sw.js/service-worker.js를 교체하세요.
