import type { Metadata } from "next";
import {
	CONSENT_VERSION_LABEL,
	CURRENT_PARENT_CONSENT_VERSION,
} from "@/lib/consent/version";

export const metadata: Metadata = {
	title: "부모 동의서 | Director's Note",
	description:
		"Director's Note 학생 평가 서비스 부모(법정대리인) 동의서. 일반 개인정보 처리 동의와 영상 기반 AI 분석(생체정보) 별도 동의를 포함합니다.",
};

const EFFECTIVE_DATE = "2026-05-21";

export default function ParentConsentPage() {
	return (
		<main className="min-h-screen bg-muted/30 px-4 py-8">
			<article className="max-w-2xl mx-auto space-y-6">
				<header className="space-y-2">
					<h1 className="text-2xl font-bold">
						학생 평가 서비스 부모(법정대리인) 동의서
					</h1>
					<p className="text-sm text-muted-foreground">
						발효일: {EFFECTIVE_DATE} · 버전: {CURRENT_PARENT_CONSENT_VERSION} ·{" "}
						{CONSENT_VERSION_LABEL}
					</p>
					<div className="rounded-md border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
						본 동의서는 초안이며 외부 법률 검토 진행 중입니다. 정식 운영 전까지
						문구·항목이 변경될 수 있습니다.
					</div>
				</header>

				<section className="space-y-2">
					<p className="leading-relaxed">
						Director's Note(이하 "서비스")는 연기입시학원이 학생의 평가 결과를
						학부모에게 전달하는 것을 돕는 B2B 도구입니다. 학생의 평가 영상·음성
						등 개인정보(특히 생체정보) 처리는 「개인정보 보호법」 제15조,
						제17조, 제23조에 따라 학부모(법정대리인)의 동의를 얻어 이루어집니다.
						본 동의서는 (1) 일반 개인정보 처리 동의 와 (2) 영상 기반 AI 분석
						(생체정보) 별도 동의 두 부분으로 구성됩니다.
					</p>
				</section>

				<Section title="제1부. 일반 개인정보 처리 동의">
					<Subsection title="1.1 처리 항목">
						<List>
							<li>학생 이름, 학년/구분</li>
							<li>평가 일자, 항목별 코치 의견 및 점수</li>
							<li>본 서비스에서 생성된 한국어 학부모 피드백 문장</li>
							<li>평가 결과 열람용 일회성 공유 링크(토큰 해시 형태로 저장)</li>
						</List>
					</Subsection>
					<Subsection title="1.2 처리 목적">
						<List>
							<li>
								학원 평가 워크플로우(학생 등록, 평가 작성, 검토, 발송) 제공
							</li>
							<li>한국어 학부모 피드백 자동 생성 및 공유</li>
							<li>서비스 운영·개선 및 부정 이용 방지</li>
						</List>
					</Subsection>
					<Subsection title="1.3 보유 및 이용 기간">
						<List>
							<li>학원과의 서비스 이용 계약 종료 시까지</li>
							<li>학원 또는 학부모의 삭제 요청 시 지체 없이 파기</li>
							<li>공유 링크 토큰은 발송일로부터 30일 후 자동 만료 및 파기</li>
						</List>
					</Subsection>
					<Subsection title="1.4 거부 권리 및 거부 시 불이익">
						<p>
							학부모는 본 동의를 거부할 권리가 있습니다. 다만 본 동의를 거부할
							경우 학원이 본 서비스를 통해 평가 결과를 학부모에게 전달할 수
							없으므로, 학원 자체의 별도 방식(서면·구두 등)으로 결과를 전달받게
							됩니다.
						</p>
					</Subsection>
				</Section>

				<Section title="제2부. 영상 기반 AI 분석 (생체정보) 별도 동의">
					<p className="text-sm font-medium">
						본 동의는 「개인정보 보호법」 제23조에 따른{" "}
						<strong>민감정보(생체정보) 처리에 관한 별도 동의</strong>입니다.
						학부모는 본 동의를 거부하더라도 제1부 동의만으로 본 서비스의 기본
						평가 기능을 이용할 수 있습니다.
					</p>
					<Subsection title="2.1 처리 항목 (생체정보)">
						<List>
							<li>
								학생의 평가 영상에서 추출한{" "}
								<strong>얼굴·음성 특징의 1408차원 임베딩 벡터</strong>
							</li>
							<li>
								원본 평가 영상은 분석 직후 24시간 내 자동 삭제됨 (스테이징
								버킷의 lifecycle 규칙). 원본 영상은 본 서비스 데이터베이스에
								장기 보관하지 않습니다.
							</li>
							<li>
								임베딩 벡터는 학원의 기준 영상(reference) 과의 코사인 유사도
								비교 목적에 한정하여 보관됩니다.
							</li>
						</List>
					</Subsection>
					<Subsection title="2.2 처리 목적">
						<List>
							<li>
								학생 영상과 학원의 기준 영상(level A/B/C/D) 간 유사도 분석
							</li>
							<li>코치의 평가 작성 보조 (점수 추천, 입시 예측)</li>
							<li>
								<strong>
									최종 평가 및 학부모 발송 내용은 코치의 검토·수정·승인을 거쳐
									결정됩니다.
								</strong>{" "}
								AI 분석 결과 자체는 학부모에게 직접 노출되지 않습니다.
							</li>
						</List>
					</Subsection>
					<Subsection title="2.3 보유 및 이용 기간">
						<List>
							<li>
								원본 평가 영상: 분석 후 최대 24시간 (스테이징 버킷 lifecycle)
							</li>
							<li>
								임베딩 벡터: 학원과의 서비스 이용 계약 종료 시까지 (학원 또는
								학부모 요청 시 즉시 파기)
							</li>
						</List>
					</Subsection>
					<Subsection title="2.4 처리 위탁 (생체정보)">
						<p>
							영상 기반 AI 분석은 다음 수탁업체의 인프라를 이용합니다. 각
							수탁업체와는 「개인정보 보호법」 제26조에 따른 의무가 계약상
							명시됩니다.
						</p>
						<div className="overflow-x-auto rounded border bg-background">
							<table className="w-full text-sm">
								<thead className="bg-muted">
									<tr>
										<th className="px-3 py-2 text-left">수탁업체</th>
										<th className="px-3 py-2 text-left">위탁 업무</th>
										<th className="px-3 py-2 text-left">처리 국가</th>
									</tr>
								</thead>
								<tbody className="divide-y">
									<tr>
										<td className="px-3 py-2">Google LLC (Vertex AI)</td>
										<td className="px-3 py-2">
											영상 → 임베딩 벡터 변환 (Multimodal Embedding API)
										</td>
										<td className="px-3 py-2">대한민국 (asia-northeast1)</td>
									</tr>
									<tr>
										<td className="px-3 py-2">Google LLC (Cloud Storage)</td>
										<td className="px-3 py-2">
											분석용 영상 임시 스테이징 (최대 24시간)
										</td>
										<td className="px-3 py-2">대한민국 (asia-northeast1)</td>
									</tr>
									<tr>
										<td className="px-3 py-2">Supabase, Inc.</td>
										<td className="px-3 py-2">
											임베딩 벡터 데이터베이스 저장 (pgvector)
										</td>
										<td className="px-3 py-2">미국</td>
									</tr>
								</tbody>
							</table>
						</div>
					</Subsection>
					<Subsection title="2.5 거부 권리 및 거부 시 불이익">
						<p>
							학부모는 영상 기반 AI 분석에 대한 본 동의를 거부할 권리가
							있습니다. 거부 시:
						</p>
						<List>
							<li>학생의 평가 영상은 본 서비스로 업로드되지 않습니다.</li>
							<li>
								코치는 본 서비스의 영상 분석 기능 없이 직접 작성한 평가
								의견만으로 학부모 피드백을 작성합니다 (서비스의 코치 직접 평가
								모드).
							</li>
							<li>본 동의 거부가 제1부 동의에 영향을 주지 않습니다.</li>
						</List>
					</Subsection>
				</Section>

				<Section title="제3부. 동의 확인 절차">
					<p>
						본 동의서는 학원이 학부모로부터 서면(또는 학원이 운영하는 별도
						경로)으로 동의를 받아 보관함을 전제로 합니다. 학원은 본 서비스의
						학생 등록 시 두 동의(제1부, 제2부)의 수령 여부를 확인하며, 본
						서비스는 학원이 입력한 확인 정보(동의서 버전, 수령 일자)만
						기록합니다.
					</p>
					<p>
						학부모는 언제든지 학원 또는 본 서비스 운영자에게 동의 철회를 요청할
						수 있으며, 철회 요청 시 해당 학생의 영상 분석 데이터는 지체 없이
						파기됩니다.
					</p>
				</Section>

				<Section title="제4부. 정보주체의 권리 및 문의처">
					<p>
						학생(만 14세 미만의 경우 법정대리인)은 본인 또는 자녀의 개인정보에
						대한 열람·정정·삭제·처리정지를 언제든지 요청할 수 있습니다.
					</p>
					<List>
						<li>학원 운영자에게 요청: 자녀가 등록된 학원에 직접 문의</li>
						<li>
							서비스 운영자에게 직접 요청:{" "}
							<a className="underline" href="mailto:hjlee@nextedition.co.kr">
								hjlee@nextedition.co.kr
							</a>
						</li>
					</List>
					<p className="text-sm text-muted-foreground">
						본 동의서와 함께 본 서비스의 전체 개인정보처리방침(
						<a className="underline" href="/privacy">
							/privacy
						</a>
						) 도 참고해 주시기 바랍니다.
					</p>
				</Section>

				<footer className="pt-4 text-xs text-muted-foreground">
					Director's Note · {EFFECTIVE_DATE} · {CURRENT_PARENT_CONSENT_VERSION}
				</footer>
			</article>
		</main>
	);
}

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="space-y-3 rounded-lg bg-background p-5 shadow-sm">
			<h2 className="text-base font-semibold">{title}</h2>
			<div className="space-y-3 text-sm leading-relaxed">{children}</div>
		</section>
	);
}

function Subsection({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<h3 className="text-sm font-semibold">{title}</h3>
			<div className="space-y-1.5">{children}</div>
		</div>
	);
}

function List({ children }: { children: React.ReactNode }) {
	return <ul className="list-disc space-y-1 pl-5">{children}</ul>;
}
