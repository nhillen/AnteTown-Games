import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { UserService, UserProfile } from '../models/User';

const callbackURL = `${process.env.FRONTEND_URL}/auth/google/callback`;
console.log('🔍 OAuth Callback URL:', callbackURL);

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: callbackURL
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await UserService.findByGoogleId(profile.id);
        
        if (user) {
          await UserService.updateLastLogin(user.id);
          return done(null, user);
        }

        const createData: {
          googleId: string;
          email: string;
          name: string;
          avatar?: string;
        } = {
          googleId: profile.id,
          email: profile.emails?.[0]?.value || '',
          name: profile.displayName
        };
        
        if (profile.photos?.[0]?.value) {
          createData.avatar = profile.photos[0].value;
        }
        
        user = await UserService.create(createData);

        return done(null, user);
      } catch (error) {
        return done(error, undefined);
      }
    }
  )
);

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await UserService.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;