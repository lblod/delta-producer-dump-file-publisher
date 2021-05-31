import { app, errorHandler } from 'mu';
import { SERVICE_NAME } from './lib/env';
import { getScheduledDumpTask, produceDumpFile } from './lib/helpers';
import { getLatestFile, storeError } from './lib/queries';
import bodyParser from 'body-parser';
import flatten from 'lodash.flatten';

app.use(bodyParser.json({ type: function(req) { return /^application\/json/.test( req.get('content-type') ); } }));

app.get('/', function(_, res) {
  const message = `Hey there, you have reached ${SERVICE_NAME}! Seems like I'm doing just fine :)`;
  res.send(message);
});

app.post('/delta', async function( req, res ) {
  try {
    const delta = req.body;
    const inserts = flatten(delta.map(changeSet => changeSet.inserts));
    const task = await getScheduledDumpTask(inserts);
    if (task) {
      produceDumpFile(task); // Not awaiting to avoid socket hangup in deltanotifier
      res.send({message: `Dump file production started`});
    } else {
      console.log('Incoming deltas do not contain any busy job, skipping.');
      res.status(204).send();
    }
  }
  catch(e){
    const msg = `General error with creating dump file: ${e}`;
    console.error(msg);
    await storeError(msg);
  }
});

app.get('/latest-dump-file', async (req, res) => {
  const file = await getLatestFile();
  if (file) {
    res.json({ data: file });
  } else {
    console.log('No dump file in the database.');
    res.status(404).send();
  }

});


app.use(errorHandler);
