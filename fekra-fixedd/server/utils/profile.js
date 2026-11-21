// Updates only the fields that were sent
export const updateBaseProfile = (client, userId, d) =>
  client.query(
    `UPDATE user_profiles SET
       full_name  = COALESCE($2, full_name),
       phone      = COALESCE($3, phone),
       city       = COALESCE($4, city),
       avatar_url = COALESCE($5, avatar_url)
     WHERE id = $1`,
    [userId, d.full_name, d.phone, d.city, d.avatar_url]
  );
