// Μόνιμη ανακατεύθυνση (308) από το παλιό host στο ff-chat.stoaops.com, με path και query.
// Μόνο για το ακριβές ff-chat.pages.dev· τα preview URLs (<hash>.ff-chat.pages.dev) μένουν ως έχουν.
export const onRequest = ({ request, next }) => {
  const url = new URL(request.url);
  if (url.hostname === "ff-chat.pages.dev") {
    url.hostname = "ff-chat.stoaops.com";
    url.protocol = "https:";
    url.port = "";
    return Response.redirect(url.toString(), 308);
  }
  return next();
};
