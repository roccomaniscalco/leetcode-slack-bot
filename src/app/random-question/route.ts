export async function GET() {
  const query = `
  query randomQuestion($categorySlug: String, $filters: QuestionListFilterInput) {
    randomQuestion(categorySlug: $categorySlug, filters: $filters) {
      questionId
      title
      titleSlug
      difficulty
      likes
      dislikes
      isPaidOnly
      categoryTitle
      content
    }
  }
  `;

  const response = await fetch("https://leetcode.com/graphql", {
    next: { revalidate: 0 }, // Always revalidate
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      operationName: "randomQuestion",
      query: query,
      variables: {
        categorySlug: "",
        filters: {},
      },
    }),
  });

  const { data } = await response.json();
  
  return Response.json(data);
}
