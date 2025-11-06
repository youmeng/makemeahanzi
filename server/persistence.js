import { getPWD } from "/lib/base";
import { Progress } from "/lib/glyphs";

const child_process = Npm.require("child_process");
const path = Npm.require("path");

const getBackupPath = () => {
	return path.join(getPWD(), "server", "backup");
};

Meteor.methods({
	backup() {
		const backupPath = getBackupPath();
		console.log(`Backup method called from client`);
		console.log(`Starting database backup to ${backupPath}...`);
		try {
			const process = child_process.spawn("mongodump", [
				"--host",
				"127.0.0.1",
				"--port",
				"3001",
				"--db",
				"meteor",
				"--out",
				backupPath,
			]);

			// Capture stdout and stderr for debugging
			process.stdout.on("data", (data) => {
				console.log(`mongodump stdout: ${data}`);
			});
			process.stderr.on("data", (data) => {
				console.error(`mongodump stderr: ${data}`);
			});

			process.on(
				"error",
				Meteor.bindEnvironment((error) => {
					console.error("mongodump error:", error);
					Progress.update({}, { $set: { backup: false } });
				})
			);
			process.on(
				"exit",
				Meteor.bindEnvironment((code) => {
					if (code === 0) {
						console.log(`Backup completed successfully at ${backupPath}`);
					} else {
						console.error(`mongodump exited with code ${code}`);
						Progress.update({}, { $set: { backup: false } });
					}
				})
			);
			Progress.update({}, { $set: { backup: true } });
			return `Backup started to ${backupPath} - check server console for progress`;
		} catch (error) {
			console.error("Failed to spawn mongodump:", error);
			throw new Meteor.Error("backup-failed", "mongodump is not available");
		}
	},
	restore() {
		const backupPath = getBackupPath();
		console.log(`Restore method called from client`);
		console.log(`Starting database restore from ${backupPath}...`);
		try {
			const process = child_process.spawn("mongorestore", [
				"--host",
				"127.0.0.1",
				"--port",
				"3001",
				"--db",
				"meteor",
				"--drop",
				backupPath,
			]);

			// Capture stdout and stderr for debugging
			process.stdout.on("data", (data) => {
				console.log(`mongorestore stdout: ${data}`);
			});
			process.stderr.on("data", (data) => {
				console.error(`mongorestore stderr: ${data}`);
			});

			process.on(
				"error",
				Meteor.bindEnvironment((error) => {
					console.error("mongorestore error:", error);
				})
			);
			process.on(
				"exit",
				Meteor.bindEnvironment((code) => {
					if (code === 0) {
						console.log(`Restore completed successfully from ${backupPath}`);
					} else {
						console.error(`mongorestore exited with code ${code}`);
					}
				})
			);
			return `Restore started from ${backupPath} - check server console for progress`;
		} catch (error) {
			console.error("Failed to spawn mongorestore:", error);
			throw new Meteor.Error("restore-failed", "mongorestore is not available");
		}
	},
});
