import { z } from 'zod';

export const STAGES = ['idea', 'prototype', 'mvp', 'early_revenue', 'growth'];

export const urlOrEmpty = z
  .union([z.literal(''), z.string().trim().max(500).url('Enter a valid web address starting with https://')])
  .optional();

// Fields of user_profiles that every role can edit
export const profileFields = {
  full_name: z.string().trim().min(2, 'Enter your full name').max(150).optional(),
  phone: z.string().trim().max(30).optional(),
  city: z.string().trim().min(1).max(100).optional(),
  avatar_url: urlOrEmpty,
};
