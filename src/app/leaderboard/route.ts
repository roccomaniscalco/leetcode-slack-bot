import { z } from "zod";

const usernames = ["roccomaniscalco2001"];
const SUBMISSIONS_LIMIT = 5;

const submissionsQuery = `    
query recentAcSubmissions($username: String!, $limit: Int!) {
  recentAcSubmissionList(username: $username, limit: $limit) {
    id
    title
    titleSlug
    timestamp
  }
}
`;

const submissionsSchema = z
  .object({
    recentAcSubmissionList: z
      .array(
        z.object({
          id: z.string(),
          title: z.string(),
          titleSlug: z.string(),
          timestamp: z.string(),
        })
      )
      .max(SUBMISSIONS_LIMIT),
  })
  .transform(({ recentAcSubmissionList }) => recentAcSubmissionList);

export async function GET() {
  const res = await fetch("https://leetcode.com/graphql", {
    next: { revalidate: 0 }, // Always revalidate
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "recentAcSubmissions",
      query: submissionsQuery,
      variables: {
        username: usernames[0],
        limit: SUBMISSIONS_LIMIT,
      },
    }),
  });

  if (!res.ok) {
    return Response.json({ success: false }, { status: 500 });
  }

  const { data } = await res.json();
  const submissions = submissionsSchema.parse(data);
  return Response.json({ success: true, submissions });
}

function isWithinPeriod(timestamp: string) {
  const dateToCheck = new Date(parseInt(timestamp) * 1000);

  // startDate is the most recent Monday at 12:00 UTC
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - ((startDate.getDay() + 6) % 7));
  startDate.setUTCHours(12, 0, 0, 0);

  return dateToCheck >= startDate;
}
