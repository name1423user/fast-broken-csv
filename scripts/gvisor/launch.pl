use strict; use POSIX ();
my $pid = fork(); defined $pid or die "fork: $!";
if ($pid == 0) { exec { $ARGV[0] } @ARGV; POSIX::_exit(127); }
waitpid($pid, 0); my $st = $?;
my $ru = "\0" x 144; syscall(165, -1, $ru) == 0 or die "getrusage: $!";
my ($us, $uu, $ss, $su) = unpack('q4', $ru);
print "CPU ", ($us + $ss) * 1000000 + $uu + $su, " ", $st, "\n";
