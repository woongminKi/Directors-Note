import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "개인정보처리방침 | Director's Note",
	description: "Director's Note 개인정보처리방침",
};

const LAST_UPDATED = "2026-05-21";
const POLICY_VERSION = "v1-draft";

export default function PrivacyPage() {
	return (
		<main className="min-h-screen bg-muted/30 px-4 py-8">
			<article className="max-w-2xl mx-auto space-y-6">
				<header className="space-y-2">
					<h1 className="text-2xl font-bold">개인정보처리방침</h1>
					<p className="text-sm text-muted-foreground">
						시행일: {LAST_UPDATED} ({POLICY_VERSION})
					</p>
					<div className="rounded-md border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
						본 방침은 초안이며 외부 법률 검토 중입니다. 정식 시행 전까지
						문구·항목이 변경될 수 있습니다. 변경 시 본 페이지에 공지합니다.
					</div>
				</header>

				<section className="space-y-2">
					<p className="leading-relaxed">
						Director's Note(이하 "서비스")는 「개인정보 보호법」 등 관계 법령상
						개인정보 보호 규정을 준수하며, 정보주체의 권익을 보호하기 위하여
						다음과 같이 개인정보처리방침을 수립·공개합니다. 본 서비스는
						연기입시학원이 학생 평가 결과를 학부모에게 전달하는 것을 돕는 B2B
						도구이며, 학원과의 계약에 따라 학원이 위탁한 범위 내에서만
						개인정보를 처리합니다.
					</p>
				</section>

				<Section title="1. 처리하는 개인정보 항목">
					<p>서비스는 다음의 개인정보를 처리합니다.</p>
					<List>
						<li>
							<strong>학원 운영자·코치 (서비스 이용자):</strong> 카카오 계정
							식별자, 이메일, 표시 이름, 소속 학원, 역할(원장/코치)
						</li>
						<li>
							<strong>학생 (정보주체, 다수는 미성년자):</strong> 이름, 학년,
							평가 일자, 평가 항목별 코치 의견 및 점수, 본 서비스에서 생성된
							한국어 피드백 문장
						</li>
						<li>
							<strong>학부모:</strong> 서비스는 학부모의 개인정보를 직접
							수집하지 않습니다. 평가 결과 열람용 일회성 링크(공유 링크)는 토큰
							해시 형태로만 저장하며 학부모 계정·연락처를 수집하지 않습니다.
						</li>
						<li>
							<strong>자동 수집:</strong> 서비스 이용 기록(접속 일시, 행위
							로그), 쿠키(세션 유지 목적), IP 주소 등 기술 정보
						</li>
					</List>
					<p className="text-sm text-muted-foreground">
						영상 기반 AI 분석 기능(생체정보 처리)이 활성화되는 경우 별도의 동의
						절차를 통해 영상·음성 데이터 처리를 안내드립니다. 본 v1 방침의 적용
						범위에는 포함되어 있지 않습니다.
					</p>
				</Section>

				<Section title="2. 개인정보의 처리 목적">
					<List>
						<li>학원 평가 워크플로우(학생 등록, 평가 작성, 검토, 발송) 제공</li>
						<li>
							코치가 작성한 평가 의견을 기반으로 한국어 학부모 피드백 자동 생성
						</li>
						<li>공유 링크를 통한 학부모의 평가 결과 열람 제공</li>
						<li>서비스 운영·개선 및 부정 이용 방지</li>
						<li>고객 문의 응대 및 법령상 의무 이행</li>
					</List>
				</Section>

				<Section title="3. 개인정보의 보유 및 이용 기간">
					<List>
						<li>
							<strong>이용자(원장·코치) 계정 정보:</strong> 학원과의 서비스 이용
							계약 종료 시까지. 계약 종료 후 30일 이내 파기.
						</li>
						<li>
							<strong>학생 평가 데이터:</strong> 학원이 위탁한 범위 내에서 보유.
							학원 또는 학부모의 삭제 요청 시 지체 없이 파기.
						</li>
						<li>
							<strong>공유 링크 토큰:</strong> 발송일로부터 30일 후 자동 만료 및
							파기.
						</li>
						<li>
							<strong>접속 로그 등 자동 수집 정보:</strong> 「통신비밀보호법」
							등 관계 법령에 따라 3개월 보관 후 파기.
						</li>
					</List>
				</Section>

				<Section title="4. 제3자 제공">
					<p>
						서비스는 정보주체의 동의, 법률의 특별한 규정 등 「개인정보 보호법」
						제17조 및 제18조에 해당하는 경우 외에는 개인정보를 제3자에게
						제공하지 않습니다.
					</p>
				</Section>

				<Section title="5. 개인정보 처리의 위탁">
					<p>서비스 운영을 위하여 다음 업체에 처리 업무를 위탁합니다.</p>
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
									<td className="px-3 py-2">Supabase, Inc.</td>
									<td className="px-3 py-2">데이터베이스·인증·파일 저장</td>
									<td className="px-3 py-2">미국</td>
								</tr>
								<tr>
									<td className="px-3 py-2">Vercel, Inc.</td>
									<td className="px-3 py-2">웹 호스팅·CDN</td>
									<td className="px-3 py-2">미국</td>
								</tr>
								<tr>
									<td className="px-3 py-2">OpenAI, L.L.C.</td>
									<td className="px-3 py-2">한국어 피드백 문장 생성 (LLM)</td>
									<td className="px-3 py-2">미국</td>
								</tr>
								<tr>
									<td className="px-3 py-2">Kakao Corp.</td>
									<td className="px-3 py-2">소셜 로그인(OAuth) 인증</td>
									<td className="px-3 py-2">대한민국</td>
								</tr>
							</tbody>
						</table>
					</div>
					<p className="text-sm text-muted-foreground">
						수탁업체와는 「개인정보 보호법」 제26조에 따라 개인정보 보호 의무 및
						안전성 확보 조치를 계약상 명시합니다. 수탁업체 또는 처리 국가가
						변경되는 경우 본 방침을 통해 공지합니다.
					</p>
				</Section>

				<Section title="6. 정보주체 및 법정대리인의 권리">
					<p>
						정보주체(학생 및 그 법정대리인) 및 이용자는 언제든지 개인정보의
						열람, 정정·삭제, 처리정지를 요구할 수 있습니다. 만 14세 미만 학생의
						경우 법정대리인이 위 권리를 행사할 수 있으며, 학원을 통해 또는 아래
						연락처로 직접 요청할 수 있습니다.
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
				</Section>

				<Section title="7. 개인정보의 안전성 확보 조치">
					<List>
						<li>전송 구간 암호화(HTTPS/TLS) 및 저장 데이터 암호화</li>
						<li>역할 기반 접근 권한 분리 및 행 수준 보안(RLS) 적용</li>
						<li>공유 링크 토큰 페퍼링 및 만료 처리</li>
						<li>접근 기록 보관 및 정기 점검</li>
						<li>업무 담당자 최소 권한 원칙 적용</li>
					</List>
				</Section>

				<Section title="8. 자동화된 의사결정">
					<p>
						서비스는 코치의 작성·검토·발송 과정에서 코치가 최종 의사결정을
						수행하는 보조 도구이며, 학생에게 법적 효력 또는 이에 준하는 중대한
						영향을 미치는 결정을 자동으로 수행하지 않습니다. 한국어 피드백
						문장은 코치가 검토·수정한 후 발송됩니다.
					</p>
				</Section>

				<Section title="9. 개인정보 보호책임자">
					<List>
						<li>책임자: 이형준 (대표)</li>
						<li>
							연락처:{" "}
							<a className="underline" href="mailto:hjlee@nextedition.co.kr">
								hjlee@nextedition.co.kr
							</a>
						</li>
					</List>
				</Section>

				<Section title="10. 권익침해 구제 방법">
					<p>
						개인정보 침해로 인한 신고나 상담이 필요한 경우 아래 기관에 문의하실
						수 있습니다.
					</p>
					<List>
						<li>개인정보분쟁조정위원회: (국번없이) 1833-6972 / kopico.go.kr</li>
						<li>개인정보침해신고센터: (국번없이) 118 / privacy.go.kr</li>
						<li>대검찰청 사이버수사과: (국번없이) 1301 / spo.go.kr</li>
						<li>경찰청 사이버수사국: (국번없이) 182 / ecrm.police.go.kr</li>
					</List>
				</Section>

				<Section title="11. 변경 이력">
					<List>
						<li>{LAST_UPDATED} — 최초 작성 (초안, 외부 법률 검토 진행 중)</li>
					</List>
				</Section>

				<footer className="pt-4 text-xs text-muted-foreground">
					Director's Note · {LAST_UPDATED}
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
		<section className="space-y-2 rounded-lg bg-background p-5 shadow-sm">
			<h2 className="text-base font-semibold">{title}</h2>
			<div className="space-y-2 text-sm leading-relaxed">{children}</div>
		</section>
	);
}

function List({ children }: { children: React.ReactNode }) {
	return <ul className="list-disc space-y-1 pl-5">{children}</ul>;
}
