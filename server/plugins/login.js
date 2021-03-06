const Joi = require('joi');
const assert = require('assert');
const crypto = require('crypto');

exports.register = function (server, options, next) {
  server.route({
    method: 'post',
    path: '/login',
    config: {
      validate: {
        payload: {
          username: Joi.string().required(),
          password: Joi.string().required()
        }
      }
    },
    handler: (request, reply) => {
      const username = request.payload.username;
      const password = request.payload.password;

      server.app.pool.connect((connectErr, client, done) => {
        assert(!connectErr, connectErr);

        client.query(
          'select username from user_table',
          (selectUserErr, usernames) => {
            assert(!selectUserErr, selectUserErr);

            if (!usernames.rows.filter((u) => username === u.username)[0]) {
              done();
              return reply
                .redirect(
                  '/login/user_not_registered=true&user=' + username
                );
            }

            client.query(
              'select password from user_table where username=$1',
              [username],
              (selectPassErr, dbPassword) => {
                done();
                assert(!selectPassErr, selectPassErr);

                if (dbPassword.rows[0].password !== password) {
                  return reply
                    .redirect(
                      '/login/incorrect_pass=true&user=' + username
                    );
                }

                const key = crypto.randomBytes(256).toString('base64');

                server.app.redisCli.keysAsync('*')
                  .then((keys) => {
                    if (keys.indexOf(username) > -1) {
                      return reply({
                        message: 'already logged in',
                        login: true
                      });
                    }

                    server.app.redisCli.setAsync(username, key)
                      .then(() => {
                        reply
                          .redirect('/')
                          .state('cookie', {
                            username: username,
                            key: key
                          });
                      })
                  })
              }
            );
          }
        );
      });
    }
  });

  next();
}

exports.register.attributes = {
  pkg: {
    name: 'login'
  }
}
