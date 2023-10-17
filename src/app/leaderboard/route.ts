import { notNullish } from "@/ts-utils";
import { z } from "zod";

const usernames = ["roccomaniscalco2001", "blah123"];
const SUBMISSIONS_LIMIT = 10;

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
    recentAcSubmissionList: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        titleSlug: z.string(),
        timestamp: z.string(),
      })
    ),
  })
  .transform(({ recentAcSubmissionList }) => recentAcSubmissionList);

type Submission = z.infer<typeof submissionsSchema>[number];

export async function GET() {
  const requests = usernames.map((username) =>
    fetch("https://leetcode.com/graphql", {
      next: { revalidate: 0 }, // Always revalidate
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationName: "recentAcSubmissions",
        query: submissionsQuery,
        variables: {
          username,
          limit: SUBMISSIONS_LIMIT,
        },
      }),
    })
  );

  const responses = await Promise.all(requests);
  const startDate = getStartDate();
  const leaderboard: Record<string, Submission[]> = {};

  for (let i = 0; i < responses.length; i++) {
    const response = notNullish(responses[i]);
    if (!response.ok) {
      return Response.json({ success: false }, { status: 500 });
    }

    const { data } = await response.json();
    const submissions = submissionsSchema.safeParse(data);
    const username = notNullish(usernames[i]);
    if (submissions.success) {
      const submissionsInPeriod = submissions.data.filter(
        (s) => new Date(parseInt(s.timestamp) * 1000) >= startDate
      );
      leaderboard[username] = submissionsInPeriod;
    }
  }

  return Response.json({
    leaderboard,
  });
}

// startDate is the most recent Monday at 12:00 UTC
function getStartDate() {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - ((startDate.getDay() + 6) % 7));
  startDate.setUTCHours(12, 0, 0, 0);
  return startDate;
}
