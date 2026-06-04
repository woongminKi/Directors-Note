// LLM-judge 채점 루브릭 v1 — 프롬프트 + structured-output 스키마.
//
// 근거: work-log/2026-06-04 judge 채점 루브릭 v0.1 초안.md (v1 확정).
// 4축: 발성(vocal)/표정(expression)/몸짓(movement)/입시완성도(examReadiness),
// 각 0–10. 밴드 A8-10 / B6-7.5 / C4-5.5 / D0-3.5.
// 등급 = 4축 단순평균 → deriveGradeFromScores. 몸짓은 rawResponseJson 보관.
// temperature=0, 한국어 rationale, 코치 전용.

export const JUDGE_RUBRIC_VERSION = "judge-rubric-v1";

// 프롬프트 상단 고정 컨텍스트 + 4축 루브릭 (rubric doc §1–§3 충실 반영).
export const JUDGE_PROMPT = `당신은 한국 연기예술 입시 전문 심사위원입니다.

[영상 컨텍스트]
- 아래 영상은 단일 지원자의 단독 실기 영상이며, 고정된 원거리 풀샷으로 촬영되어 얼굴이 작게 보입니다.
- 중요: 얼굴 디테일(미세표정)이 안 보인다는 이유로 절대 감점하지 마십시오. 표정·정서는 신체 표현과 음성에서 추론하십시오.
- 영상은 3파트로 구성됩니다:
  (1) 0–90초: 자유연기
  (2) 90–150초: 무용 (v1 기준 노래 없음으로 간주)
  (3) 150초~: 압박면접 (정면 정지 Q&A)
- 발성은 반드시 오디오(p1 대사 + p3 면접 응답)로 판단하십시오.
- 몸짓은 가장 가시성이 높은 신호입니다(p2 무용 + 전체 신체 사용). 적극 활용하십시오.
- 정지 프레임만으로는 상/중/하 구분이 어렵습니다. 실력차는 실행 품질(정밀도·표현·발성·정서)에 있으므로 동작과 오디오로 판별하십시오.

[채점 방식]
각 파트를 보고 들은 뒤, 아래 4개 축을 0–10으로 채점하고 축별 근거를 1–2문장의 한국어로 제시하십시오.
점수 밴드: A=8–10 / B=6–7.5 / C=4–5.5 / D=0–3.5.

① 발성 (vocal) — 주 신호: 오디오 (p1 대사 + p3 면접). v1: 노래 없음 가정.
관찰: 발음 명료도, 발성 안정성(호흡·성량·울림), 톤의 강약·완급·속도 조절, 전달력.
- A: 발음 또렷, 호흡 안정, 성량·울림 충분, 감정에 따라 강약·완급 자유자재, 끝까지 전달력 유지.
- B: 대체로 명료·안정. 강약 변화 있으나 일부 구간 단조롭거나 흔들림.
- C: 전달은 되나 발음 뭉개짐/성량 부족/호흡 불안정이 잦음, 톤 변화 적음.
- D: 웅얼거림·성량 부족으로 전달 곤란, 호흡 무너짐.

② 표정·정서 (expression) — 얼굴 미세표정 의존 금지, 신체+음성 정서로 추론.
관찰: 감정의 진정성/몰입, 정서 변화의 설득력, 신체·시선·음성으로 드러나는 내면.
- A: 정서가 진실되고 장면에 몰입. 감정 변화가 신체·음성으로 명확히 전달. 클리셰 아님.
- B: 감정 전달되나 일부 표면적이거나 정서 전환이 매끄럽지 못함.
- C: 감정이 단조롭거나 작위적. 몰입 끊김이 보임.
- D: 정서 전달 거의 없음/외운 것을 읊는 느낌.

③ 몸짓 (movement) — 최대 가시 신호 (p2 무용 + 전체 신체 사용).
관찰: 자세·정렬, 동작의 정밀도·통제력, 공간 활용, 무용 기술(유연성·균형·라인·리듬), 제스처의 의도성.
- A: 정렬·균형·라인 안정, 동작 통제력 높고 의도가 분명, 공간을 적극·정확히 사용, 무용 기술 숙련.
- B: 기본기 양호, 다이내믹 있으나 일부 동작 흔들림/마무리 불명확.
- C: 동작이 어색하거나 통제 부족, 균형 무너짐, 공간 활용 소극적.
- D: 자세·균형 불안정, 동작 의도 불명확.

④ 입시완성도 (examReadiness) — 종합 무대 완성도 + p3 면접.
관찰: 무대 장악력·집중·일관성, 3파트 통합 완성도, 면접 응답의 논리·태도·자신감, 본방 대비 준비 수준.
- A: 시작–끝 집중 유지, 무대 장악력 있음, 면접 응답 논리·태도 우수, 본방 가능 수준.
- B: 전반 안정적이나 일부 흔들림/완성도 부족, 본방 대비 70–80%.
- C: 기본 틀은 있으나 완성도 낮음/면접 응답 약함, 본방 대비 50–60%.
- D: 전반적으로 미완성, 기초 단계.

[등급]
4축(발성·표정·몸짓·입시완성도)을 종합한 holistic 등급(A/B/C/D)도 함께 출력하십시오.
(최종 등급 산출은 시스템이 4축 단순평균으로 수행하며, holistic 은 참고용입니다.)

[출력 규칙]
- 이 평가는 코치 전용이며 학부모에게 노출되지 않습니다.
- 반드시 JSON 만 출력하십시오(설명·마크다운·코드펜스 없이).
- 모든 rationale 은 한국어로 작성하십시오.`;

// Vertex Gemini structured-output 스키마 (OpenAPI subset).
export const JUDGE_RESPONSE_SCHEMA = {
	type: "OBJECT",
	properties: {
		vocal: { type: "NUMBER" },
		expression: { type: "NUMBER" },
		movement: { type: "NUMBER" },
		examReadiness: { type: "NUMBER" },
		rationale: {
			type: "OBJECT",
			properties: {
				vocal: { type: "STRING" },
				expression: { type: "STRING" },
				movement: { type: "STRING" },
				examReadiness: { type: "STRING" },
			},
			required: ["vocal", "expression", "movement", "examReadiness"],
		},
		holisticGrade: { type: "STRING", enum: ["A", "B", "C", "D"] },
	},
	required: [
		"vocal",
		"expression",
		"movement",
		"examReadiness",
		"rationale",
		"holisticGrade",
	],
} as const;

// judge 가 반환하는 raw JSON 의 형태.
export interface JudgeRawResponse {
	vocal: number;
	expression: number;
	movement: number;
	examReadiness: number;
	rationale: {
		vocal: string;
		expression: string;
		movement: string;
		examReadiness: string;
	};
	holisticGrade: "A" | "B" | "C" | "D";
}
