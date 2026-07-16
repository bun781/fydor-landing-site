import { AdminSubmissionReview } from "@/components/admin-submission-review";

export default async function AdminSubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main><AdminSubmissionReview submissionId={id} /></main>;
}
