import { z } from "zod";

const usernames = ["roccomaniscalco2001"];

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

const submissionsSchema = z.object({
  recentAcSubmissionList: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      titleSlug: z.string(),
      timestamp: z.string(),
    })
  ),
}).transform(({ recentAcSubmissionList }) => recentAcSubmissionList);

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
        limit: 10,
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
